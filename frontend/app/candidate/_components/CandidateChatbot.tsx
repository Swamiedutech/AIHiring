"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  Bot, Send, X, MessageSquare, 
  Sparkles, User, Minus, Maximize2,
  Paperclip, Smile, MoreHorizontal,
  ChevronRight, BrainCircuit
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { aiApi } from "@/lib/api";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Message = {
  id: number;
  text: string;
  sender: "bot" | "user";
  time: string;
  isNew?: boolean;
};

// --- Typewriter Component ---
function Typewriter({ text, onComplete }: { text: string; onComplete?: () => void }) {
  const [displayedText, setDisplayedText] = useState("");
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (index < text.length) {
      const timeout = setTimeout(() => {
        setDisplayedText((prev) => prev + text[index]);
        setIndex((prev) => prev + 1);
      }, 10);
      return () => clearTimeout(timeout);
    } else if (onComplete) {
      onComplete();
    }
  }, [index, text, onComplete]);

  return (
    <div className="prose prose-sm prose-slate max-w-none break-words leading-relaxed text-slate-700 font-medium
        prose-p:my-1 prose-ul:my-1 prose-li:my-0.5 prose-strong:text-blue-700 prose-strong:font-bold">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {displayedText}
      </ReactMarkdown>
    </div>
  );
}

export default function CandidateChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    { 
      id: 1, 
      text: "Hello! I'm your AI Recruitment Assistant. How can I help you with your application today?", 
      sender: "bot", 
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
    }
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMsg: Message = {
      id: Date.now(),
      text: input,
      sender: "user",
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    try {
      const history = messages.map(m => ({
        role: m.sender === "bot" ? "assistant" : "user",
        content: m.text
      }));

      const response = await aiApi.chat(input, history);
      
      const botMsg: Message = {
        id: Date.now() + 1,
        text: response.data.data || "I'm sorry, I couldn't process that. How else can I help?",
        sender: "bot",
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isNew: true
      };
      setMessages(prev => [...prev, botMsg]);
    } catch (error) {
      console.error("Chat error:", error);
      const errorMsg: Message = {
        id: Date.now() + 1,
        text: "System is experiencing high load. Please try again in a moment.",
        sender: "bot",
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      {/* Chat Window */}
      {isOpen && (
        <Card className="w-[380px] h-[calc(100vh-160px)] mb-4 border-none shadow-[0_8px_40px_rgba(0,0,0,0.18)] rounded-2xl bg-white flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-300">
           {/* Header */}
           <div className="px-5 py-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                 <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-md">
                    <BrainCircuit className="w-5 h-5 text-white" />
                 </div>
                 <div>
                    <h3 className="font-bold text-sm tracking-tight">MSK AI Assistant</h3>
                    <div className="flex items-center gap-1.5 mt-0.5">
                       <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
                       <span className="text-[9px] font-bold text-blue-100 uppercase tracking-widest opacity-80">Online & Ready</span>
                    </div>
                 </div>
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                className="w-8 h-8 rounded-lg hover:bg-white/15 text-white/80 hover:text-white" 
                onClick={() => setIsOpen(false)}
              >
                <X className="w-4 h-4" />
              </Button>
           </div>

           {/* Feed */}
           <div 
             ref={scrollRef}
             className="flex-1 overflow-y-auto p-5 space-y-5 bg-[#F8FAFC] min-h-0"
             style={{ scrollbarWidth: 'thin', scrollbarColor: '#CBD5E1 transparent' }}
           >
              {messages.map((m) => (
                <div key={m.id} className={cn("flex flex-col group", m.sender === "user" ? "items-end" : "items-start")}>
                   <div className={cn(
                     "max-w-[85%] px-4 py-3 rounded-2xl shadow-sm transition-all duration-300",
                     m.sender === "user" 
                      ? "bg-blue-600 text-white rounded-br-md" 
                      : "bg-white text-slate-700 rounded-bl-md border border-slate-100"
                   )}>
                      {m.sender === "user" ? (
                        <p className="text-sm font-medium leading-relaxed">{m.text}</p>
                      ) : (
                        m.isNew ? (
                          <Typewriter text={m.text} />
                        ) : (
                          <div className="prose prose-sm prose-slate max-w-none break-words leading-relaxed text-slate-700 font-medium
                            prose-p:my-1 prose-ul:my-1 prose-li:my-0.5 prose-strong:text-blue-700 prose-strong:font-bold">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {m.text}
                            </ReactMarkdown>
                          </div>
                        )
                      )}
                   </div>
                   <span className="text-[9px] font-semibold text-slate-300 mt-1.5 px-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {m.sender === "user" ? "You" : "AI"} · {m.time}
                   </span>
                </div>
              ))}
              {isTyping && (
                <div className="flex flex-col items-start animate-in fade-in slide-in-from-left-2">
                   <div className="bg-white border border-slate-100 px-4 py-3 rounded-2xl rounded-bl-md shadow-sm flex gap-1.5 items-center">
                      <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                      <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                      <div className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce" />
                   </div>
                </div>
              )}
           </div>

           {/* Input */}
           <div className="px-4 py-3 bg-white border-t border-slate-100 shrink-0">
              <div className="flex items-center gap-2 bg-slate-50 p-1.5 pl-4 rounded-full border border-slate-200/60 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100 focus-within:border-blue-300 transition-all duration-200">
                 <input 
                   value={input}
                   onChange={(e) => setInput(e.target.value)}
                   onKeyDown={(e) => e.key === "Enter" && handleSend()}
                   placeholder="Type your message here..." 
                   className="flex-1 bg-transparent border-none focus:ring-0 focus:outline-none text-sm font-medium text-slate-700 placeholder:text-slate-400"
                 />
                 <Button 
                   onClick={handleSend}
                   disabled={!input.trim() || isTyping}
                   size="icon"
                   className="w-9 h-9 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-md shadow-blue-200/50 flex items-center justify-center shrink-0 transition-all active:scale-95 disabled:opacity-40 disabled:shadow-none"
                 >
                    <Send className="w-4 h-4" />
                 </Button>
              </div>
              <p className="text-center text-[9px] text-slate-300 font-semibold mt-2.5 uppercase tracking-[0.15em]">MSK Recruitment Intelligence</p>
           </div>
        </Card>
      )}

      {/* Toggle Button */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "relative w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 hover:scale-105",
          isOpen 
            ? "bg-slate-800 text-white shadow-lg shadow-slate-300/30 hover:bg-slate-700" 
            : "bg-blue-600 text-white shadow-lg shadow-blue-300/40 hover:shadow-blue-400/50"
        )}
      >
        {isOpen ? <X className="w-5 h-5" /> : <BrainCircuit className="w-6 h-6" />}
        {!isOpen && (
          <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 border-2 border-white rounded-full" />
        )}
      </button>
    </div>
  );
}
