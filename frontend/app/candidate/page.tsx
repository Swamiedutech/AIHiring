"use client";

import React, { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { candidateApi } from "@/lib/api";
import { useAuthStore, useUIStore } from "@/lib/store";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Briefcase, ClipboardList, Video, FileText, CheckCircle,
  AlertCircle, Search, ChevronRight, Zap, User, ArrowRight,
  ShieldCheck, Info, FlaskConical, Beaker, Settings, PenTool, Layout,
  Calendar, Mail, Star, HelpCircle, Activity, Target, Sparkles
} from "lucide-react";
import { cn } from "@/lib/utils";

type CandidateOverview = {
  applications?: Array<{ id?: number; jobId?: { title?: string }; stage?: string; status?: string; applied_at?: string }>;
  dashboard?: { applications?: Array<{ id?: number; jobId?: { title?: string }; stage?: string; status?: string; applied_at?: string }> };
  nextAction?: { message?: string; href?: string } | string;
};

export default function CandidateDashboard() {
  const { user } = useAuthStore();
  const { setPageTitle } = useUIStore();
  const router = useRouter();

  useEffect(() => {
    setPageTitle("Dashboard");
  }, []);

  const { data: overview, isLoading } = useQuery<CandidateOverview, Error>({
    queryKey: ["candidate-overview"],
    queryFn: () => candidateApi.getDashboard().then((r) => r.data),
    enabled: !!user,
    refetchInterval: 30_000, // 30s — dashboard data doesn't need sub-10s polling
  });

  const apps = overview?.applications || overview?.dashboard?.applications || [];
  const latestApp = apps[0];
  const appStatus = latestApp?.status?.toUpperCase() || "NONE";

  const calculateProfileCompletion = () => {
    const candidate = (overview as any)?.candidate;
    if (!candidate) return 10; // Base 10% for registering
    
    const fields = [
      candidate.phone,
      candidate.location,
      candidate.education && candidate.education !== "Not Provided",
      candidate.specialization && candidate.specialization !== "Not Provided",
      candidate.skills && candidate.skills.length > 0,
      candidate.summary,
      candidate.resume_path,
      candidate.profile_image_path
    ];
    
    const filled = fields.filter(f => !!f).length;
    return Math.min(100, 20 + (filled * 10));
  };

  const completionPercentage = calculateProfileCompletion();

  const getStepStatus = (index: number) => {
    // 0: Profile Setup, 1: Application Review, 2: Skills Assessment, 3: Technical Interview, 4: Final Offer
    if (index === 0) return completionPercentage === 100 ? "completed" : "current";

    const statusMap: Record<string, number> = {
      // Step 1: Application Review / Screening
      "APPLIED": 1,
      "SCREENING": 1,
      "RESUME_REVIEW": 1,
      "RESUME_SUBMITTED": 1,
      "RESUME_EVALUATED": 1,
      "SHORTLISTED": 1,

      // Step 2: Skills Assessment
      "ASSESSMENT_UNLOCKED": 2,
      "TECHNICAL_ROUND": 2,
      "TECHNICAL_ROUND_PENDING": 2,
      "TECHNICAL_ROUND_IN_PROGRESS": 2,
      "ASSESSMENT_IN_PROGRESS": 2,
      "TECHNICAL_ROUND_COMPLETED": 2,
      "ASSESSMENT_COMPLETED": 2,

      // Step 3: AI Interview
      "INTERVIEW_SCHEDULED": 3,
      "INTERVIEW_UNLOCKED": 3,
      "INTERVIEW_PENDING": 3,
      "INTERVIEW_IN_PROGRESS": 3,
      "RE_INTERVIEW_REQUESTED": 3,
      "INTERVIEW_COMPLETED": 3,

      // Step 4: HR Review & Final Offer
      "RECOMMENDED_BY_AI": 4,
      "PROCEED_TO_HR": 4,
      "HR_REVIEW": 4,
      "OFFERED": 4,
      "OFFER_SENT": 4,
      "SELECTED": 4,
      "HIRED": 4,
      "ACCEPTED": 4,
      "OFFER_REJECTED": 4,
    };

    const currentStage = statusMap[appStatus] || (apps.length > 0 ? 1 : 0);

    if (currentStage > index) return "completed";
    if (currentStage === index) return "current";
    return "pending";
  };

  const getStageColor = (status?: string) => {
    if (!status) return "bg-blue-50 text-blue-600";
    const s = status.toUpperCase();
    if (s.includes("OFFER")) return "bg-emerald-50 text-emerald-600";
    if (s.includes("INTERVIEW")) return "bg-purple-50 text-purple-600";
    if (s.includes("ASSESSMENT") || s.includes("TECHNICAL")) return "bg-blue-50 text-blue-600";
    return "bg-slate-50 text-slate-400";
  };

  const nextSteps = [
    {
      label: "Profile Setup",
      date: completionPercentage === 100 ? "Completed" : "In Progress",
      status: getStepStatus(0),
      icon: User,
      desc: completionPercentage === 100 
        ? "Your professional profile is 100% complete." 
        : `Your profile is ${completionPercentage}% complete. Update it now.`
    },
    {
      label: "Application Review",
      date: getStepStatus(1) === "completed" ? "Completed" : getStepStatus(1) === "current" ? "In Progress" : "Upcoming",
      status: getStepStatus(1),
      icon: FileText,
      desc: "Recruiters are evaluating your resume."
    },
    {
      label: "Skills Assessment",
      date: getStepStatus(2) === "completed" ? "Completed" : getStepStatus(2) === "current" ? "Active" : "Upcoming",
      status: getStepStatus(2),
      icon: Target,
      desc: "Complete tests to showcase your skills."
    },
    {
      label: "Technical Interview",
      date: getStepStatus(3) === "completed" ? "Completed" : getStepStatus(3) === "current" ? "Scheduled" : "Upcoming",
      status: getStepStatus(3),
      icon: Video,
      desc: "Live interaction with our tech team."
    },
    {
      label: "Final Offer",
      date: getStepStatus(4) === "completed" || getStepStatus(5) === "completed" ? "Completed" : getStepStatus(4) === "current" ? "Received" : "Upcoming",
      status: getStepStatus(4),
      icon: Star,
      desc: "Join the AI Hiring System family."
    },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-8">
      {/* Welcome Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-foreground tracking-tight">Welcome, {user?.name?.split(" ")[0] || "Candidate"}! 👋</h2>
          <p className="text-muted-foreground font-medium text-sm">Your career journey at AI Hiring System starts here.</p>
        </div>
        <Button onClick={() => router.push("/candidate/profile")} className="bg-white/60 hover:bg-white/80 text-foreground border border-white/30 h-10 px-5 rounded-xl font-semibold shadow-sm flex items-center gap-2 transition-all text-xs backdrop-blur-sm">
          Update Profile <ArrowRight className="w-3.5 h-3.5" />
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Applications List */}
        <div className="lg:col-span-8 space-y-6">
          <Card className="border border-border/40 shadow-sm rounded-2xl overflow-hidden">
            <CardHeader className="p-6 pb-3 flex flex-row items-center justify-between border-b border-border/30">
              <CardTitle className="text-sm font-bold text-foreground">Active Applications</CardTitle>
              <Badge className="bg-blue-50 text-blue-600 px-3 py-1 rounded border-none font-semibold text-[10px]">{apps.length} Roles</Badge>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border/30">
                {apps.length > 0 ? apps.map((app: any, idx: number) => (
                  <div
                    key={`app-${app.id || app._id || ''}-${idx}`}
                    onClick={() => router.push(`/candidate/application/${app.id}`)}
                    className="px-6 py-4 flex flex-col md:flex-row md:items-center justify-between hover:bg-primary/[0.04] transition-all cursor-pointer group border-b border-border/30 last:border-0"
                  >
                    <div className="flex items-center gap-4 mb-3 md:mb-0">
                      <div className={cn(
                        "w-10 h-10 rounded-md flex items-center justify-center transition-all group-hover:scale-105 duration-300 shrink-0",
                        idx % 3 === 0 ? "bg-blue-50 text-blue-600" : idx % 3 === 1 ? "bg-emerald-50 text-emerald-600" : "bg-purple-50 text-purple-600"
                      )}>
                        {idx % 3 === 0 ? <Beaker className="w-5 h-5" /> : idx % 3 === 1 ? <FlaskConical className="w-5 h-5" /> : <Layout className="w-5 h-5" />}
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{app.jobId?.title || "Role Title"}</h4>
                        <div className="flex items-center gap-1.5 text-muted-foreground mt-0.5">
                          <Briefcase className="w-3 h-3" />
                          <span className="text-[11px] font-medium">AI Hiring System Pvt. Ltd.</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between md:gap-5">
                      <Badge className={cn("px-3 py-1 rounded border-none font-bold uppercase text-[9px] tracking-wider", getStageColor(app.status))}>
                        {app.status?.replace(/_/g, " ") || "APPLIED"}
                      </Badge>
                      <div className="text-right hidden xl:block min-w-[80px]">
                       <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Applied On</p>
                        <p className="text-[12px] font-semibold text-foreground mt-0.5">{app.applied_at ? new Date(app.applied_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : "26 Apr 2026"}</p>
                      </div>
                      <div className="w-7 h-7 rounded bg-muted/30 flex items-center justify-center text-muted-foreground group-hover:bg-primary group-hover:text-white transition-all">
                        <ChevronRight className="w-4 h-4" />
                      </div>
                    </div>
                  </div>
                )) : (
                  <div className="p-6 text-center space-y-4">
                    <div className="w-12 h-12 bg-muted/30 rounded-lg flex items-center justify-center mx-auto">
                      <Search className="w-5 h-5 text-muted-foreground/40" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-foreground">No active applications</h4>
                      <p className="text-xs text-muted-foreground font-medium mt-1">You haven't applied for any positions yet.</p>
                    </div>
                    <Button onClick={() => router.push("/candidate/application")} className="bg-blue-600 hover:bg-blue-700 h-9 px-6 rounded-md font-semibold text-xs">Browse Open Positions</Button>
                  </div>
                )}
              </div>
              {apps.length > 0 && (
                <div className="p-4 border-t border-border/30 text-center bg-muted/10">
                  <Button variant="link" className="text-blue-600 font-semibold text-xs hover:no-underline flex items-center gap-1.5 mx-auto h-auto p-0" onClick={() => router.push("/candidate/application")}>
                    View All Applications <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* What's Next Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-foreground">How our process works</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { title: "Assessments", desc: "Showcase your skills through curated technical tests.", icon: ClipboardList, color: "bg-blue-50 text-blue-600" },
                { title: "Interviews", desc: "Interact with our lead engineers and hiring managers.", icon: Video, color: "bg-emerald-50 text-emerald-600" },
                { title: "Offer", desc: "Receive a formal offer and join our innovative team.", icon: Zap, color: "bg-purple-50 text-purple-600" }
              ].map((item, i) => (
                <Card key={i} className="border border-border/40 shadow-sm rounded-2xl p-5 flex flex-col gap-4 group hover:shadow-md transition-all">
                  <div className={cn("w-10 h-10 rounded-md flex items-center justify-center group-hover:scale-105 transition-transform duration-300", item.color)}>
                    <item.icon className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-foreground text-[13px]">{item.title}</h4>
                    <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{item.desc}</p>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar: Next Steps */}
        <div className="lg:col-span-4 space-y-6">
          <Card className="border border-border/40 shadow-sm rounded-2xl overflow-hidden p-6">
            <h3 className="text-sm font-bold text-foreground mb-6 flex items-center gap-2.5">
              <Activity className="w-4 h-4 text-blue-600" /> Next Steps
            </h3>

            <div className="relative space-y-6">
              {/* Vertical Line */}
              <div className="absolute left-[15px] top-[24px] bottom-[24px] w-0.5 border-l-2 border-dashed border-border/40" />

              {nextSteps.map((step, i) => (
                <div key={i} className="flex items-start gap-4 relative z-10 group">
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center border-4 border-white shadow-sm transition-all duration-300 shrink-0",
                    step.status === "completed" ? "bg-emerald-500 text-white" :
                      step.status === "current" ? "bg-blue-600 text-white animate-pulse" :
                        "bg-slate-100 text-slate-400"
                  )}>
                    {step.status === "completed" ? <CheckCircle className="w-3.5 h-3.5" /> : <step.icon className="w-3.5 h-3.5" />}
                  </div>
                  <div className="flex-1 pt-0.5">
                    <div className="flex items-center justify-between mb-0.5">
                      <h4 className={cn("font-semibold text-[13px]", step.status === "current" ? "text-primary" : "text-foreground")}>{step.label}</h4>
                      <span className={cn(
                        "text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded",
                        step.status === "completed" ? "bg-emerald-50 text-emerald-600" :
                          step.status === "current" ? "bg-blue-50 text-blue-600" :
                            "bg-slate-50 text-slate-400"
                      )}>{step.date}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      {step.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 p-4 bg-muted/20 rounded-xl border border-border/40">
              <div className="flex items-center gap-3 text-muted-foreground">
                <HelpCircle className="w-4 h-4 shrink-0" />
                <p className="text-[11px] leading-tight">Need assistance? <button onClick={() => router.push("/contact")} className="text-blue-600 font-semibold hover:underline">Contact Support</button></p>
              </div>
            </div>
          </Card>

          {/* Mini Banner */}
          <Card className="border border-primary shadow-sm rounded-2xl bg-gradient-to-br from-[#003b9a] to-[#0050cb] p-6 text-white relative overflow-hidden group">
            <div className="relative z-10 space-y-3">
              <h4 className="text-[13px] font-bold">Top 1% Candidate?</h4>
              <p className="text-blue-100 text-[11px] leading-relaxed">Verified profiles get 3x more interview invites. Update your skills now.</p>
              <Button className="bg-white text-blue-600 hover:bg-blue-50 h-8 px-4 rounded font-semibold text-[11px]" onClick={() => router.push("/candidate/profile")}>
                Verify Profile
              </Button>
            </div>
            <Sparkles className="absolute -right-4 -bottom-4 w-24 h-14 opacity-10 group-hover:scale-110 transition-transform duration-500" />
          </Card>
        </div>
      </div>

      {/* Footer Disclaimer */}
      <div className="pt-6 border-t border-border/40 flex flex-col md:flex-row items-center justify-between gap-4 text-muted-foreground">
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-4 h-4 text-blue-600/50" />
          <p className="text-[11px] font-medium">Data secured with AES-256 encryption. Powered by AI Hiring System AI.</p>
        </div>
        <p className="text-[10px] font-bold uppercase tracking-widest">© 2026 AI Hiring System PVT. LTD.</p>
      </div>
    </div>
  );
}
