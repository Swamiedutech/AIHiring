"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Briefcase, Settings, Users, FileText,
  Shield, ChevronLeft, ChevronRight, Bot,
  ClipboardList, Calendar, HelpCircle, User, LogOut, Cpu, MessageSquare, Settings2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore, useUIStore } from "@/lib/store";
import { Button } from "@/components/ui/button";

const navGroups = [
  {
    group: "OPERATIONAL HUB", items: [
      { label: "Dashboard", href: "/candidate", icon: LayoutDashboard },
      { label: "My Applications", href: "/candidate/application", icon: Briefcase },
      { label: "Assessments", href: "/candidate/assessment", icon: ClipboardList },
      { label: "Interview Schedule", href: "/candidate/interview", icon: Calendar },
      { label: "Job Offers", href: "/candidate/offer", icon: FileText },
    ]
  },
  {
    group: "PROFILE & SETTINGS", items: [
      { label: "Profile", href: "/candidate/profile", icon: User },
    ]
  }
];

export default function CandidateSidebar() {
  const pathname = usePathname();
  const { user, clearAuth } = useAuthStore();
  const { sidebarOpen, toggleSidebar } = useUIStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return <aside className="w-14 bg-white border-r h-screen" />;

  return (
    <aside
      className={cn(
        "relative z-30 flex flex-col transition-all duration-300 ease-in-out h-screen border-r bg-white",
        sidebarOpen ? "w-56" : "w-14"
      )}
    >
      {/* Header / Logo */}
      <div className="flex items-center gap-2.5 px-3 h-12">
        <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center shadow-sm shadow-blue-200">
          <Cpu className="text-white w-4 h-4" />
        </div>
        {sidebarOpen && (
          <div className="flex flex-col">
            <span className="font-semibold text-[12px] tracking-tight text-slate-900">AI Hiring System</span>
            <span className="text-[9px] text-slate-400 font-medium tracking-wider">AI POWERED HIRING</span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-2 space-y-5 overflow-y-auto">
        {navGroups.map((group) => (
          <div key={group.group} className="space-y-2">
            {sidebarOpen && (
              <h3 className="px-3 text-[9px] font-bold text-slate-400 tracking-widest uppercase">
                {group.group}
              </h3>
            )}
            <div className="space-y-1">
              {group.items.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "group flex items-center gap-3 px-3 py-2 rounded-lg text-[12px] font-medium transition-all",
                      isActive
                        ? "bg-blue-50 text-blue-600"
                        : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                    )}
                  >
                    <item.icon className={cn(
                      "w-4 h-4 flex-shrink-0",
                      isActive ? "text-blue-600" : "text-slate-400 group-hover:text-slate-600"
                    )} />
                    {sidebarOpen && <span>{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Help Card */}
      {sidebarOpen && (
        <div className="p-2.5 mx-3 mb-3 bg-blue-50 rounded-lg border border-blue-100">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center">
              <HelpCircle className="w-3 h-3 text-white" />
            </div>
            <div>
              <p className="text-[11px] font-bold text-slate-900">Need Help?</p>
              <p className="text-[9px] text-slate-500">We're here to help you</p>
            </div>
          </div>
          <Link href="/contact" className="w-full">
            <Button size="sm" variant="outline" className="w-full bg-white text-blue-600 border-blue-200 hover:bg-blue-50 text-[10px] font-bold h-7">
              Contact Support
            </Button>
          </Link>
        </div>
      )}

      {/* Footer / Toggle & Logout */}
      <div className="p-2 border-t border-slate-100">
        <button
          onClick={() => { clearAuth(); window.location.href = "/login"; }}
          className="w-full flex items-center gap-3 px-3 py-1.5 rounded-lg text-red-500 hover:bg-red-50 transition-all text-[12px] font-medium"
        >
          <LogOut className="w-4 h-4" />
          {sidebarOpen && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );
}
