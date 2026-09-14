"use client";

import React, { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { candidateApi, BACKEND_URL, getFileUrl } from "@/lib/api";
import { useUIStore } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
   Briefcase, Calendar, FileText, CheckCircle,
   ChevronRight, ArrowLeft, Download, Info, Clock, AlertCircle, Video,
   MapPin, Globe, Building2, ExternalLink, Activity, Target
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function ApplicationDetailPage() {
   const params = useParams();
   const id = String(params.id);
   const router = useRouter();
   const { setPageTitle } = useUIStore();

   const { data: details, isLoading } = useQuery({
      queryKey: ["app-details", id],
      queryFn: () => candidateApi.getApplicationDetails(id).then(r => r.data),
   });

   useEffect(() => {
      setPageTitle("Application Details");
   }, []);

   const app = details?.application;
   const job = details?.job || app?.job;
   const timeline = details?.timeline || [];

   if (isLoading) return <div className="p-20 text-center animate-pulse text-slate-400 font-bold uppercase tracking-widest">Preparing Dossier...</div>;
   if (!app) return <div className="p-20 text-center text-red-500 font-bold">Application index not found.</div>;

   const canViewOffer = app.status === "OFFERED" || app.status === "HIRED";

   const getStatusConfig = (status: string) => {
      const s = status.toUpperCase();
      if (s.includes("REJECTED")) return { color: "bg-red-50 text-red-600", label: "Closed" };
      if (s.includes("HIRED")) return { color: "bg-emerald-50 text-emerald-600", label: "Hired" };
      if (s.includes("OFFER")) return { color: "bg-purple-50 text-purple-600", label: "Offer Phase" };
      return { color: "bg-blue-50 text-blue-600", label: "Active" };
   };

   const statusConfig = getStatusConfig(app.status);

   return (
      <div className="max-w-6xl mx-auto space-y-10 pb-12">
         {/* Top Nav */}
         <div className="flex items-center justify-between">
            <Button variant="ghost" onClick={() => router.push("/candidate/application")} className="gap-2 text-slate-500 hover:text-slate-900 font-bold transition-all px-0">
               <ArrowLeft className="w-5 h-5" /> Back to Applications
            </Button>
            {canViewOffer && (
               <Button className="bg-emerald-600 hover:bg-emerald-700 h-12 px-5 rounded-xl font-bold gap-2 shadow-lg shadow-emerald-100" onClick={() => router.push(`/candidate/offer/${id}`)}>
                  <CheckCircle className="w-4 h-4" /> View Offer Letter
               </Button>
            )}
         </div>

         <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8 space-y-10">
               {/* Job Summary Card */}
               <Card className="border-none shadow-sm rounded-[40px] bg-white overflow-hidden p-6">
                  <div className="flex flex-col md:flex-row justify-between items-start gap-5">
                     <div className="space-y-6 flex-1">
                        <div className="flex items-center gap-3">
                           <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center">
                              <Briefcase className="w-6 h-6" />
                           </div>
                           <Badge className={cn("px-4 py-1.5 rounded-lg border-none font-bold text-[10px] uppercase tracking-widest", statusConfig.color)}>
                              {statusConfig.label}
                           </Badge>
                        </div>
                        <div>
                           <h1 className="text-lg font-black text-slate-900 tracking-tight leading-tight">{job?.title}</h1>
                           <div className="flex flex-wrap items-center gap-6 mt-4 text-slate-500 font-medium">
                              <div className="flex items-center gap-2">
                                 <Building2 className="w-4 h-4" />
                                 <span>AI Hiring System Pvt. Ltd.</span>
                              </div>
                              <div className="flex items-center gap-2">
                                 <MapPin className="w-4 h-4" />
                                 <span>{job?.location || "Remote / Pune"}</span>
                              </div>
                           </div>
                        </div>
                     </div>
                     <div className="text-right">
                        <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-1">Applied on</p>
                        <p className="text-lg font-bold text-slate-900">{new Date(app.applied_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                     </div>
                  </div>
               </Card>

               {/* Timeline Card */}
               <Card className="border-none shadow-sm rounded-[40px] bg-white p-6">
                  <div className="flex items-center justify-between mb-12">
                     <h3 className="text-lg font-black text-slate-900 flex items-center gap-3">
                        <Activity className="w-6 h-6 text-blue-600" /> Progress Timeline
                     </h3>
                     <Badge className="bg-slate-50 text-slate-400 px-4 py-1.5 rounded-lg border-none font-bold text-[10px] uppercase">Live Sync Active</Badge>
                  </div>

                  <div className="relative space-y-12">
                     <div className="absolute left-[23px] top-[40px] bottom-[40px] w-0.5 bg-slate-50" />

                     {timeline.length > 0 ? timeline.map((event: any, idx: number) => (
                        <div key={idx} className="relative pl-16 group">
                           <div className={cn(
                              "absolute left-0 top-1 w-12 h-12 rounded-full flex items-center justify-center border-4 border-white shadow-md z-10 transition-all duration-500",
                              idx === timeline.length - 1 ? "bg-blue-600 text-white scale-110 shadow-blue-200" : "bg-white text-slate-200 border-slate-50"
                           )}>
                              {idx === timeline.length - 1 ? (
                                 <div className="w-3 h-3 rounded-full bg-white animate-pulse" />
                              ) : (
                                 <CheckCircle className="w-6 h-6 text-emerald-500" />
                              )}
                           </div>
                           <div className="space-y-2">
                              <div className="flex items-center gap-4">
                                 <h4 className="text-lg font-bold text-slate-900">{event.label || event.new_status?.replace(/_/g, " ")}</h4>
                                 <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{new Date(event.changed_at || event.date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>
                              </div>
                              {event.metadata?.reason && (
                                 <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 italic text-sm text-slate-500 leading-relaxed font-medium">
                                    "{event.metadata.reason}"
                                 </div>
                              )}
                           </div>
                        </div>
                     )) : (
                        <div className="relative pl-16">
                           <div className="absolute left-0 top-1 w-12 h-12 rounded-full flex items-center justify-center border-4 border-white shadow-md bg-blue-600 text-white z-10">
                              <CheckCircle className="w-6 h-6" />
                           </div>
                           <div>
                              <h4 className="text-lg font-bold text-slate-900">Application Submitted</h4>
                              <p className="text-sm text-slate-500 mt-1 font-medium">Evaluation process initiated by AI recruitment systems.</p>
                           </div>
                        </div>
                     )}
                  </div>
               </Card>
            </div>

            <div className="lg:col-span-4 space-y-10">
               {/* Quick Action Card */}
               <Card className="border-none shadow-sm rounded-[40px] bg-slate-900 p-6 text-white overflow-hidden relative group">
                  <div className="relative z-10 space-y-8">
                     <div className="space-y-2">
                        <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Next Action Required</p>
                        <h3 className="text-lg font-black leading-tight">
                           {app.status === "TECHNICAL_ROUND_PENDING" ? "Complete Technical Assessment" :
                              app.status === "INTERVIEW_SCHEDULED" ? "Join AI Interview Session" :
                                 app.status === "OFFERED" ? "Review & Finalize Offer" : "Evaluation in Progress"}
                        </h3>
                     </div>

                     {app.status === "REJECTED" || app.status === "AUTO_REJECTED" ? (
                        <p className="text-slate-400 text-sm font-medium leading-relaxed">Thank you for your interest. The evaluation for this role is now closed.</p>
                     ) : (
                        <div className="space-y-4">
                           {app.status === "TECHNICAL_ROUND_PENDING" && (
                              <Button className="w-full h-16 bg-blue-600 hover:bg-blue-700 text-white rounded-[24px] font-black uppercase tracking-widest transition-all" onClick={() => router.push(`/candidate/assessment/${id}`)}>
                                 Start Assessment <ChevronRight className="w-5 h-5 ml-2" />
                              </Button>
                           )}
                           {app.status === "INTERVIEW_SCHEDULED" && (
                              <Button className="w-full h-16 bg-blue-600 hover:bg-blue-700 text-white rounded-[24px] font-black uppercase tracking-widest transition-all" onClick={() => router.push(`/candidate/interview`)}>
                                 Join Interview <ChevronRight className="w-5 h-5 ml-2" />
                              </Button>
                           )}
                           <p className="text-[10px] text-slate-500 text-center font-bold uppercase tracking-widest">System generated next step</p>
                        </div>
                     )}
                  </div>
                  <Activity className="absolute -right-6 -bottom-6 w-32 h-32 opacity-10 group-hover:scale-125 transition-transform duration-700" />
               </Card>

               {/* Documents Card */}
               <Card className="border-none shadow-sm rounded-[40px] bg-white p-6">
                  <h3 className="text-xl font-black text-slate-900 mb-8 flex items-center gap-3">
                     <FileText className="w-5 h-5 text-blue-600" /> Records & Docs
                  </h3>
                  <div className="space-y-4">
                     {[
                        { label: "My Resume", icon: FileText, color: "text-blue-600", bg: "bg-blue-50", url: app.resume_url, active: !!app.resume_url },
                        { label: "Assessment Report", icon: Target, color: "text-purple-600", bg: "bg-purple-50", active: !!details.assessment },
                        { label: "Interview Transcript", icon: Video, color: "text-emerald-600", bg: "bg-emerald-50", active: !!details.interview }
                     ].map((doc, i) => (
                        <div
                           key={i}
                           onClick={() => doc.url && window.open(getFileUrl(doc.url), "_blank")}
                           className={cn(
                              "flex items-center justify-between p-6 rounded-lg border-2 transition-all group",
                              doc.active ? "bg-white border-slate-50 hover:border-blue-100 hover:shadow-sm cursor-pointer" : "bg-slate-50 border-slate-50 opacity-50 grayscale cursor-not-allowed"
                           )}
                        >
                           <div className="flex items-center gap-4">
                              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", doc.bg, doc.color)}>
                                 <doc.icon className="w-5 h-5" />
                              </div>
                              <span className="font-bold text-slate-900 text-sm">{doc.label}</span>
                           </div>
                           {doc.active && <Download className="w-4 h-4 text-slate-300 group-hover:text-blue-600" />}
                        </div>
                     ))}
                  </div>
               </Card>

               {/* Need Help? */}
               <div className="p-5 bg-blue-50/50 rounded-xl border border-blue-50 flex flex-col items-center text-center gap-4">
                  <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center shadow-sm text-blue-600">
                     <Info className="w-6 h-6" />
                  </div>
                  <div>
                     <h4 className="font-bold text-slate-900">Questions?</h4>
                     <p className="text-xs text-slate-500 mt-1 font-medium">Reach out to our recruitment team if you have any doubts.</p>
                  </div>
                  <Button onClick={() => router.push("/contact")} variant="link" className="text-blue-600 font-black uppercase text-[10px] tracking-widest p-0">Contact Support</Button>
               </div>
            </div>
         </div>
      </div>
   );
}
