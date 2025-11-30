import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';        // YE ADD KIYA
import remarkGfm from 'remark-gfm';

function App() {
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Where should we begin!" }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => { scrollToBottom(); }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage = { role: "user", content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${import.meta.env.VITE_GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [...messages, userMessage],
          temperature: 0.7,
          max_tokens: 2048
        })
      });

      if (!response.ok) throw new Error("API Error");

      const data = await response.json();
      const aiReply = data.choices[0].message.content;

      setMessages(prev => [...prev, { role: "assistant", content: aiReply }]);
    } catch (error) {
      setMessages(prev => [...prev, { 
        role: "assistant", 
        content: "Bhai API key galat hai ya internet slow hai. Key check karo ya thodi der baad try karo!" 
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
    <>
      <div className="min-h-screen bg-gray-100 flex flex-col">
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-5 shadow-xl">
          <h1 className="text-3xl font-bold text-center">AI ChatBot</h1>
          <p className="text-center mt-1">© 2025 Osama Sarfaraz</p>
        </div>

        <div className="flex-1 overflow-y-auto p-5 max-w-5xl mx-auto w-full">
          {messages.map((msg, index) => (
            <div key={index} className={`mb-5 flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-3xl px-6 py-4 rounded-3xl shadow-lg
                ${msg.role === "user" ? "bg-blue-600 text-white" : "bg-white text-gray-800 border border-gray-300"}
              `}>
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    strong: ({children}) => <strong className="font-bold">{children}</strong>,
                    h1: ({children}) => <h1 className="text-2xl font-bold mt-6 mb-3">{children}</h1>,
                    h2: ({children}) => <h2 className="text-xl font-bold mt-5 mb-2">{children}</h2>,
                    ul: ({children}) => <ul className="list-disc list-inside space-y-2 my-4 my-4">{children}</ul>,
                    ol: ({children}) => <ol className="list-decimal list-inside space-y-2 my-4">{children}</ol>,
                    code: ({inline, children}) => inline ? 
                      <code className="bg-gray-200 px-2 py-1 rounded text-sm font-medium">{children}</code> :
                      <pre className="bg-gray-900 text-white p-4 rounded-xl overflow-x-auto my-5"><code>{children}</code></pre>
                  }}
                >
                  {msg.content}
                </ReactMarkdown>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start mb-5">
              <div className="bg-white px-6 py-4 rounded-3xl shadow-lg border">
                <div className="flex space-x-2">
                  <div className="w-3 h-3 bg-gray-600 rounded-full animate-bounce"></div>
                  <div className="w-3 h-3 bg-gray-600 rounded-full animate-bounce delay-100"></div>
                  <div className="w-3 h-3 bg-gray-600 rounded-full animate-bounce delay-200"></div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="border-t bg-white p-5 shadow-2xl">
          <div className="max-w-5xl mx-auto flex gap-4">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask anything ..."
              className="flex-1 px-6 py-4 rounded-full border border-gray-300 focus:outline-none focus:ring-4 focus:ring-purple-400 text-lg"
              disabled={loading}
            />
            <button
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              className="px-10 py-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold rounded-full hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 transition transform hover:scale-105"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export default App;