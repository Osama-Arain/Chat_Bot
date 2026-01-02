import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import * as mammoth from 'mammoth';
import { Paperclip, FileText, X, MessageSquare, Loader, AlertCircle, CheckCircle } from 'lucide-react';

function App() {
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Where should we begin! ✨" }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [processingFile, setProcessingFile] = useState(false);
  const [toastNotification, setToastNotification] = useState(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => { scrollToBottom(); }, [messages]);

  // Load PDF.js library
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.async = true;
    script.onload = () => {
      if (window['pdfjs-dist/build/pdf']) {
        window['pdfjs-dist/build/pdf'].GlobalWorkerOptions.workerSrc = 
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      }
    };
    document.head.appendChild(script);
  }, []);

  // Show toast notification
  const showToast = (message, type = 'success') => {
    setToastNotification({ message, type });
    setTimeout(() => setToastNotification(null), 4000);
  };

  // PDF text extraction
  const extractTextFromPDF = async (file) => {
    return new Promise(async (resolve, reject) => {
      try {
        const pdfjsLib = window['pdfjs-dist/build/pdf'];
        
        if (!pdfjsLib) {
          reject(new Error("PDF.js library not loaded. Please refresh."));
          return;
        }

        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        
        let fullText = "";
        
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          const page = await pdf.getPage(pageNum);
          const textContent = await page.getTextContent();
          const pageText = textContent.items
            .map(item => item.str)
            .join(' ')
            .trim();
          
          if (pageText) {
            fullText += `${pageText}\n`;
          }
        }
        
        if (fullText.trim().length < 10) {
          reject(new Error("No text found. Might be a scanned PDF."));
          return;
        }
        
        resolve(fullText.trim());
        
      } catch (error) {
        reject(new Error(`PDF read error: ${error.message}`));
      }
    });
  };

  // Word document extraction
  const extractTextFromWord = async (file) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      
      if (!result.value || result.value.trim().length < 10) {
        throw new Error("No text found in Word file");
      }
      
      return result.value;
    } catch (error) {
      throw new Error(`Word error: ${error.message}`);
    }
  };

  // Plain text extraction
  const extractTextFromTxt = async (file) => {
    try {
      const text = await file.text();
      if (!text || text.trim().length < 10) {
        throw new Error("Text file is empty");
      }
      return text;
    } catch (error) {
      throw new Error(`Text error: ${error.message}`);
    }
  };

  // File upload handler with toast notifications
  const handleFileUpload = async (event) => {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;
    
    setProcessingFile(true);

    for (const file of files) {
      try {
        let content = "";
        const fileName = file.name.toLowerCase();

        if (fileName.endsWith('.pdf') || file.type === 'application/pdf') {
          content = await extractTextFromPDF(file);
        } 
        else if (fileName.endsWith('.docx') || fileName.endsWith('.doc') || 
                 file.type.includes('word')) {
          content = await extractTextFromWord(file);
        } 
        else if (fileName.endsWith('.txt') || file.type.startsWith('text/')) {
          content = await extractTextFromTxt(file);
        } 
        else {
          throw new Error("Unsupported format. Use PDF, Word, or Text.");
        }

        if (!content || content.trim().length === 0) {
          throw new Error("No content extracted.");
        }

        const newDoc = {
          id: Date.now() + Math.random(),
          name: file.name,
          content: content,
          size: (file.size / 1024).toFixed(2) + " KB",
          charCount: content.length,
          type: fileName.endsWith('.pdf') ? 'PDF' : fileName.endsWith('.docx') || fileName.endsWith('.doc') ? 'Word' : 'Text'
        };
        
        setDocuments(prev => [...prev, newDoc]);
        
        // Show success toast
        showToast(`✅ ${file.name} uploaded successfully!`, 'success');

      } catch (error) {
        // Show error toast
        showToast(`❌ ${file.name}: ${error.message}`, 'error');
      }
    }

    setProcessingFile(false);
    event.target.value = "";
  };

  // Remove document
  const removeDocument = (id) => {
    setDocuments(prev => prev.filter(d => d.id !== id));
    showToast('🗑️ Document removed', 'info');
  };

  // Clear all documents
  const clearAllDocuments = () => {
    setDocuments([]);
    showToast('🗑️ All documents cleared', 'info');
  };

  // Check if query is document-related
  const isDocumentQuery = (query) => {
    const docKeywords = [
      'document', 'file', 'pdf', 'doc', 'paper', 'report', 'assignment',
      'what does', 'what is', 'explain', 'summary', 'summarize', 'tell me about',
      'information', 'details', 'content', 'written', 'mentioned', 'states',
      'according to', 'in the', 'from the', 'based on', 'کیا', 'کیسے', 'بتاؤ'
    ];
    
    const lowerQuery = query.toLowerCase();
    return docKeywords.some(keyword => lowerQuery.includes(keyword));
  };

  // Send message with smart RAG detection
  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage = { role: "user", content: input };
    setMessages(prev => [...prev, userMessage]);
    const currentInput = input;
    setInput("");
    
    // Check if this is a document-related query
    const needsDocContext = documents.length > 0 && isDocumentQuery(currentInput);
    
    setLoading(needsDocContext);

    try {
      let systemPrompt = "";
      
      if (documents.length > 0 && needsDocContext) {
        systemPrompt = `You are an AI assistant with access to documents. Answer based on these documents.

📚 AVAILABLE DOCUMENTS (${documents.length}):
\n`;
        
        documents.forEach((doc, idx) => {
          const contentChunk = doc.content.length > 12000 
            ? doc.content.substring(0, 12000) + "\n[content truncated]"
            : doc.content;
          
          systemPrompt += `\n=== DOCUMENT ${idx + 1}: ${doc.name} ===\n${contentChunk}\n\n`;
        });
        
        systemPrompt += `\nQUESTION: ${currentInput}\n\nProvide detailed answers based on documents. If not found, say so clearly.`;
      }

      const apiMessages = systemPrompt
        ? [
            { role: "system", content: systemPrompt },
            ...messages.slice(-4).filter(m => m.role !== "system"),
            userMessage
          ]
        : [...messages.slice(-6), userMessage];

      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${import.meta.env.VITE_GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: apiMessages,
          temperature: needsDocContext ? 0.2 : 0.7,
          max_tokens: 3000
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `API Error: ${response.status}`);
      }

      const data = await response.json();
      const aiReply = data.choices[0].message.content;

      setMessages(prev => [...prev, { role: "assistant", content: aiReply }]);
      
    } catch (error) {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: `❌ Error: ${error.message}`
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex flex-col">
      {/* Toast Notification - Top Right Corner */}
      {toastNotification && (
        <div className="fixed top-4 right-4 z-50 animate-[slideIn_0.3s_ease-out]">
          <div className={`
            ${toastNotification.type === 'success' ? 'bg-green-500' : 
              toastNotification.type === 'error' ? 'bg-red-500' : 'bg-blue-500'}
            text-white px-6 py-4 rounded-lg shadow-2xl flex items-center gap-3 min-w-[300px] max-w-md
          `}>
            {toastNotification.type === 'success' && <CheckCircle className="w-5 h-5 flex-shrink-0" />}
            {toastNotification.type === 'error' && <AlertCircle className="w-5 h-5 flex-shrink-0" />}
            {toastNotification.type === 'info' && <FileText className="w-5 h-5 flex-shrink-0" />}
            <p className="text-sm font-medium">{toastNotification.message}</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-700 text-white p-6 shadow-2xl">
        <h1 className="text-4xl font-bold text-center flex items-center justify-center gap-3">
          <MessageSquare className="w-10 h-10" />
     AI ChatBot
        </h1>
        <p className="text-center mt-2 text-blue-100">© 2025 </p>
      </div>

      {/* Processing File Notification */}
      {processingFile && (
        <div className="bg-amber-50 border-l-4 border-amber-500 p-4 max-w-5xl mx-auto w-full mt-4 shadow-lg rounded-lg">
          <div className="flex items-center gap-3">
            <Loader className="w-5 h-5 text-amber-600 animate-spin" />
            <span className="text-sm font-medium text-amber-800">Reading file...</span>
          </div>
        </div>
      )}

      {/* Documents Bar */}
      {documents.length > 0 && (
        <div className="bg-white border-b shadow-md p-4">
          <div className="max-w-5xl mx-auto">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold text-gray-800">📂 Uploaded Documents ({documents.length})</p>
              <button
                onClick={clearAllDocuments}
                className="text-xs text-red-600 hover:text-red-800 font-medium hover:underline"
              >
                Clear All
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {documents.map(doc => (
                <div key={doc.id} className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-300 rounded-xl p-3 shadow-sm hover:shadow-md transition">
                  <div className="flex items-start gap-3">
                    <FileText className="w-5 h-5 text-blue-600 flex-shrink-0 mt-1" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate" title={doc.name}>
                        {doc.name}
                      </p>
                      <p className="text-xs text-gray-600 mt-1">
                        {doc.type} • {doc.size} • {doc.charCount.toLocaleString()} chars
                      </p>
                    </div>
                    <button
                      onClick={() => removeDocument(doc.id)}
                      className="text-red-500 hover:text-red-700 hover:bg-red-100 p-1.5 rounded-full transition flex-shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-5 pb-32 max-w-5xl mx-auto w-full">
        {messages.map((msg, index) => (
          <div key={index} className={`mb-5 flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-3xl px-6 py-4 rounded-3xl shadow-lg
              ${msg.role === "user" 
                ? "bg-gradient-to-r from-blue-600 to-blue-700 text-white" 
                : "bg-white text-gray-800 border-2 border-gray-200"}
            `}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  strong: ({children}) => <strong className="font-bold">{children}</strong>,
                  em: ({children}) => <em className="italic">{children}</em>,
                  h1: ({children}) => <h1 className="text-2xl font-bold mt-4 mb-3">{children}</h1>,
                  h2: ({children}) => <h2 className="text-xl font-bold mt-3 mb-2">{children}</h2>,
                  h3: ({children}) => <h3 className="text-lg font-semibold mt-2 mb-1">{children}</h3>,
                  ul: ({children}) => <ul className="list-disc list-inside space-y-1 my-3 ml-2">{children}</ul>,
                  ol: ({children}) => <ol className="list-decimal list-inside space-y-1 my-3 ml-2">{children}</ol>,
                  li: ({children}) => <li className="ml-1">{children}</li>,
                  p: ({children}) => <p className="my-2 leading-relaxed">{children}</p>,
                  blockquote: ({children}) => <blockquote className="border-l-4 border-gray-300 pl-4 italic my-3">{children}</blockquote>,
                  code: ({inline, children}) => inline ? 
                    <code className="bg-gray-200 px-2 py-0.5 rounded text-sm font-mono">{children}</code> :
                    <pre className="bg-gray-900 text-green-400 p-4 rounded-xl overflow-x-auto my-4 text-sm"><code>{children}</code></pre>
                }}
              >
                {msg.content}
              </ReactMarkdown>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start mb-5">
            <div className="bg-white px-6 py-4 rounded-3xl shadow-lg border-2 border-blue-200">
              <div className="flex items-center gap-3">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                  <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                </div>
                <span className="text-gray-700 text-sm">Searching documents...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area - FIXED AT BOTTOM (ChatGPT Style) */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t-2 shadow-2xl p-4 z-40">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-end gap-3 bg-gray-50 rounded-3xl border-2 border-gray-300 p-2 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-200 transition">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={processingFile || loading}
              className="p-3 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
              title="Attach PDF/Word/Text File"
            >
              <Paperclip className="w-6 h-6" />
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              multiple
              accept=".pdf,.doc,.docx,.txt"
              className="hidden"
            />
            <textarea
              className="flex-1 resize-none bg-transparent border-none outline-none py-2 px-3 text-gray-800 text-base placeholder-gray-400 max-h-32"
              placeholder="Ask anything or type your question here..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyPress}
              rows={1}
              disabled={processingFile}
              style={{
                minHeight: '40px',
                maxHeight: '120px',
                overflowY: 'auto'
              }}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || loading || processingFile}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-3 rounded-2xl font-semibold transition flex-shrink-0 shadow-md hover:shadow-lg"
            >
              Send
            </button>
          </div>
        </div>
      </div>

      {/* Custom Animation Styles */}
      <style>{`
        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}

export default App;