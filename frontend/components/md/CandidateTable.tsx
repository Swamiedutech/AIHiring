"use client";

import React, { useState } from "react";
import api, { BACKEND_URL, getFileUrl } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle, XCircle, Loader2, User, Briefcase, ExternalLink, Activity,
  Plus, Minus, Info, Mail, MapPin, GraduationCap, Star, AlertTriangle,
  ShieldCheck, FileText, Phone, BrainCircuit, Sparkles
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";

export default function CandidateTable({ apps = [], refresh }: any) {
  const [isLoading, setIsLoading] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{ app: any; action: 'APPROVED' | 'REJECTED' } | null>(null);
  const [mdNotes, setMdNotes] = useState("");

  const handleDecisionConfirmed = async () => {
    if (!confirmDialog) return;
    const { app, action } = confirmDialog;
    try {
      setIsLoading(true);
      await api.post("/md/decision", {
        application_id: app.id,
        decision: action,
        md_notes: mdNotes || null,
      });
      toast.success(
        action === "APPROVED"
          ? `✅ ${app.candidateName || app.candidate?.name || 'Candidate'} recommended to HR`
          : `❌ ${app.candidateName || app.candidate?.name || 'Candidate'} rejected for HR review`
      );
      setConfirmDialog(null);
      setMdNotes("");
      refresh();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to submit recommendation");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  if (!apps || apps.length === 0) {
    return (
      <div className="text-center py-32 bg-slate-50/50 rounded-lg border-2 border-dashed border-slate-100 m-10">
        <div className="w-16 h-16 bg-white rounded-lg flex items-center justify-center mx-auto mb-6 shadow-sm border border-slate-100">
           <Briefcase className="w-8 h-8 text-slate-300" />
        </div>
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400">PIPELINE_SYNCHRONIZED_NO_PENDING_ACTION</p>
      </div>
    );
  }

  const candidateName = confirmDialog?.app?.candidateName || confirmDialog?.app?.candidate?.name || "Candidate";
  const candidateEmail = confirmDialog?.app?.candidateEmail || confirmDialog?.app?.candidate?.email || "—";
  const candidatePhone = confirmDialog?.app?.candidate?.phone || "—";
  const jobTitle = confirmDialog?.app?.jobTitle || confirmDialog?.app?.Job?.title || "—";
  const department = confirmDialog?.app?.department || confirmDialog?.app?.Job?.department || "—";
  const aiScore = confirmDialog?.app?.aiScore || confirmDialog?.app?.score || 0;
  const experience = confirmDialog?.app?.candidate?.experience_years || confirmDialog?.app?.experience_years || 0;
  const education = confirmDialog?.app?.profile?.education || confirmDialog?.app?.education || "—";
  const skills = confirmDialog?.app?.profile?.skills || confirmDialog?.app?.skills || [];

  return (
    <>
      {/* ═══ 2-STEP CONFIRMATION MODAL ═══ */}
      <Dialog open={!!confirmDialog} onOpenChange={(open) => { if (!open) { setConfirmDialog(null); setMdNotes(""); } }}>
        <DialogContent className="max-w-lg bg-white border-slate-100 rounded-xl shadow-2xl p-0 overflow-hidden">
          {/* Header Strip */}
          <div className={cn(
            "px-6 py-4 border-b",
            confirmDialog?.action === 'APPROVED'
              ? "bg-emerald-50 border-emerald-100"
              : "bg-rose-50 border-rose-100"
          )}>
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-10 h-10 rounded-lg flex items-center justify-center",
                confirmDialog?.action === 'APPROVED'
                  ? "bg-emerald-100"
                  : "bg-rose-100"
              )}>
                {confirmDialog?.action === 'APPROVED'
                  ? <CheckCircle className="w-5 h-5 text-emerald-600" />
                  : <XCircle className="w-5 h-5 text-rose-600" />
                }
              </div>
              <div>
                <DialogTitle className="text-sm font-black uppercase tracking-wider text-slate-800">
                  {confirmDialog?.action === 'APPROVED' ? 'Confirm Recommendation' : 'Confirm Rejection'}
                </DialogTitle>
                <DialogDescription className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">
                  Step 2 of 2 — Verification Required
                </DialogDescription>
              </div>
            </div>
          </div>

          {/* Candidate Info */}
          <div className="px-6 py-4 space-y-4">
            <div className={cn(
              "p-4 rounded-lg border",
              confirmDialog?.action === 'APPROVED'
                ? "bg-emerald-50/50 border-emerald-100"
                : "bg-rose-50/50 border-rose-100"
            )}>
              <p className="text-xs text-slate-600 leading-relaxed">
                {confirmDialog?.action === 'APPROVED'
                  ? <>Do you really want to <span className="font-black text-emerald-700">recommend</span> candidate <span className="font-black text-slate-900">{candidateName}</span> to HR for final selection?</>
                  : <>Do you really want to <span className="font-black text-rose-700">reject</span> candidate <span className="font-black text-slate-900">{candidateName}</span> for HR review?</>
                }
              </p>
            </div>

            {/* Candidate Quick Profile */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <h4 className="text-[9px] font-black uppercase tracking-widest text-slate-400">Candidate Info</h4>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <User className="w-3 h-3 text-slate-400" />
                    <span className="text-[11px] font-bold text-slate-700">{candidateName}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Mail className="w-3 h-3 text-slate-400" />
                    <span className="text-[10px] text-slate-500">{candidateEmail}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="w-3 h-3 text-slate-400" />
                    <span className="text-[10px] text-slate-500">{candidatePhone}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <GraduationCap className="w-3 h-3 text-slate-400" />
                    <span className="text-[10px] text-slate-500">{education}</span>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <h4 className="text-[9px] font-black uppercase tracking-widest text-slate-400">Position & Score</h4>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Briefcase className="w-3 h-3 text-slate-400" />
                    <span className="text-[10px] font-bold text-slate-700">{jobTitle}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Activity className="w-3 h-3 text-slate-400" />
                    <span className="text-[10px] text-slate-500">{department}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <BrainCircuit className="w-3 h-3 text-slate-400" />
                    <span className="text-[10px] text-slate-500">AI Score: <span className="font-bold text-primary">{Math.round(aiScore)}%</span></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Star className="w-3 h-3 text-slate-400" />
                    <span className="text-[10px] text-slate-500">Exp: {experience} years</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Skills */}
            {Array.isArray(skills) && skills.length > 0 && (
              <div>
                <h4 className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Skills</h4>
                <div className="flex flex-wrap gap-1">
                  {skills.slice(0, 8).map((s: string, i: number) => (
                    <Badge key={i} variant="outline" className="text-[8px] font-bold bg-blue-50 text-blue-600 border-blue-100 px-1.5 py-0">
                      {s}
                    </Badge>
                  ))}
                  {skills.length > 8 && (
                    <Badge variant="outline" className="text-[8px] font-bold bg-slate-50 text-slate-400 border-slate-200 px-1.5 py-0">
                      +{skills.length - 8} more
                    </Badge>
                  )}
                </div>
              </div>
            )}

            {/* MD Notes */}
            <div>
              <h4 className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">MD Notes / Comments (Optional)</h4>
              <Textarea
                placeholder="Add notes for HR team..."
                value={mdNotes}
                onChange={(e) => setMdNotes(e.target.value)}
                className="text-xs h-20 resize-none border-slate-200 focus:border-primary"
              />
            </div>
          </div>

          {/* Warning */}
          <div className="px-6 pb-2">
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-100 rounded-lg">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-[10px] text-amber-700 leading-relaxed">
                This recommendation will be sent to HR for final decision. MD does not make the final selection — HR is the final authority.
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <DialogFooter className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex sm:justify-between gap-3">
            <Button
              variant="outline"
              className="flex-1 h-11 font-black uppercase text-[10px] tracking-widest border-slate-200"
              onClick={() => { setConfirmDialog(null); setMdNotes(""); }}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              className={cn(
                "flex-1 h-11 text-white font-black uppercase text-[10px] tracking-widest gap-2 shadow-lg",
                confirmDialog?.action === 'APPROVED'
                  ? "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-200"
                  : "bg-rose-600 hover:bg-rose-500 shadow-rose-200"
              )}
              onClick={handleDecisionConfirmed}
              disabled={isLoading}
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> :
               confirmDialog?.action === 'APPROVED' ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
              {confirmDialog?.action === 'APPROVED' ? 'Confirm Recommendation' : 'Confirm Rejection'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ TABLE ═══ */}
      <div className="w-full overflow-x-auto">
        <table className="w-full border-collapse min-w-[700px]">
          <thead>
            <tr className="bg-slate-50/50 border-b border-slate-100/60">
              <th className="px-6 py-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Candidate</th>
              <th className="px-6 py-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Position</th>
              <th className="px-6 py-5 text-center text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">AI Score</th>
              <th className="px-6 py-5 text-center text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Status</th>
              <th className="px-6 py-5 text-center text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {apps.map((app: any) => {
              const aiData = app.AIAnalysis || app.AIDecision || {};
              const pros = Array.isArray(aiData.pros) ? aiData.pros : (aiData.pros ? aiData.pros.split(',') : []);
              const cons = Array.isArray(aiData.cons) ? aiData.cons : (aiData.cons ? aiData.cons.split(',') : []);
              const score = aiData.score || app.score || 0;
              
              const aiRec = (aiData.ai_decision || app.ai_recommendation || "PENDING").toUpperCase();
              const aiStyle =
                 aiRec === "APPROVED" || aiRec === "RECOMMENDED" || aiRec === "STRONGLY_RECOMMENDED"
                   ? "bg-emerald-50 text-emerald-600 border-emerald-100"
                   : aiRec === "REJECTED" || aiRec === "REJECT"
                   ? "bg-rose-50 text-rose-600 border-rose-100"
                   : "bg-slate-50 text-slate-400 border-slate-100";

              const status = app.status?.toUpperCase() || "PENDING";
              const statusStyle =
                status === "APPROVED" ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                status === "REJECTED" ? "bg-rose-50 text-rose-600 border-rose-100" :
                "bg-blue-50 text-blue-600 border-blue-100";

              const hasDecision = app.final_decision === 'APPROVED' || app.final_decision === 'REJECTED'
                || app.final_decision === 'MD_RECOMMENDED' || app.final_decision === 'MD_REJECTED';

              return (
                <React.Fragment key={app.id}>
                  <tr className="group hover:bg-slate-50/50 transition-all duration-500">
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-6">
                        <div className="w-14 h-14 rounded-lg bg-slate-900 flex items-center justify-center text-white shadow-sm group-hover:scale-110 transition-transform relative overflow-hidden">
                          {app.profileImage || app.candidate?.profile_image_path ? (
                            <img 
                              src={app.profileImage || (app.candidate?.profile_image_path ? getFileUrl(app.candidate.profile_image_path) : '')}
                              alt="Profile" 
                              className="w-full h-full object-cover"
                              onError={(e: any) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'block'; }}
                            />
                          ) : null}
                          <User className="w-6 h-6" style={{ display: (app.profileImage || app.candidate?.profile_image_path) ? 'none' : 'block' }} />
                          <div className="absolute inset-x-0 bottom-0 h-1 bg-blue-600" />
                        </div>
                        <div>
                          <p className="text-sm font-black text-[#0f172a] tracking-tight leading-none uppercase mb-2">
                            {app.candidate?.name || app.candidateName || app.Candidate?.name || "Anonymous Intelligence"}
                          </p>
                          <p className="text-[9px] text-slate-400 font-black uppercase tracking-[0.2em]">NODE_ID: #{app.id} • VERIFIED</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-4">
                         <div className="p-2 bg-blue-50 rounded-lg">
                            <Briefcase className="w-4 h-4 text-blue-600" />
                         </div>
                         <div>
                            <p className="text-xs font-black text-[#0f172a] uppercase tracking-tight leading-none mb-1.5">{app.Job?.title || app.jobTitle || "System Operation"}</p>
                            <p className="text-[9px] text-slate-400 font-black tracking-widest uppercase">{app.Job?.department || app.department || "Unassigned Unit"}</p>
                         </div>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex flex-col items-center gap-3">
                         <div className="flex items-center gap-4">
                            <span className="text-lg font-black text-[#0f172a] tabular-nums tracking-tighter">{score}%</span>
                            <Badge className={cn("px-3 py-1 text-[9px] font-black uppercase tracking-widest border shadow-none", aiStyle)}>
                               AI_OP_{aiRec}
                            </Badge>
                         </div>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-center">
                      <Badge variant="outline" className={cn("px-4 py-1.5 text-[9px] font-black uppercase tracking-widest rounded-full", statusStyle)}>
                        {status}
                      </Badge>
                      {hasDecision && (
                        <div className="mt-1.5">
                          <Badge className={cn("text-[8px] font-bold border-none px-2 py-0.5",
                            app.final_decision === 'MD_RECOMMENDED' || app.final_decision === 'APPROVED'
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-rose-100 text-rose-700"
                          )}>
                            {app.final_decision === 'MD_RECOMMENDED' || app.final_decision === 'APPROVED' ? 'MD RECOMMENDED' : 'MD REJECTED'}
                          </Badge>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex items-center justify-center gap-4">
                        {!hasDecision ? (
                          <>
                            <Button
                              className="h-12 w-12 rounded-lg bg-white border border-slate-100 text-emerald-600 hover:bg-emerald-600 hover:text-white transition-all shadow-xl shadow-slate-200/50 active:scale-90"
                              onClick={() => setConfirmDialog({ app, action: 'APPROVED' })}
                              disabled={isLoading}
                              title="Recommend to HR"
                            >
                              <CheckCircle className="w-6 h-6" />
                            </Button>
                            <Button
                              className="h-12 w-12 rounded-lg bg-white border border-slate-100 text-rose-600 hover:bg-rose-600 hover:text-white transition-all shadow-xl shadow-slate-200/50 active:scale-90"
                              onClick={() => setConfirmDialog({ app, action: 'REJECTED' })}
                              disabled={isLoading}
                              title="Reject for HR review"
                            >
                              <XCircle className="w-6 h-6" />
                            </Button>
                          </>
                        ) : (
                          <Badge variant="outline" className="text-[9px] font-bold py-1.5 px-3 border-slate-200 text-slate-400">
                            Decision Submitted
                          </Badge>
                        )}
                        <Button
                          className="h-12 w-12 rounded-lg bg-slate-900 border border-slate-800 text-white hover:bg-black transition-all shadow-xl shadow-slate-200/50 active:scale-90"
                          onClick={() => (window.location.href = `/md/applications/${app.id}`)}
                        >
                          <ExternalLink className="w-6 h-6" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                  {/* Authority Insight Row */}
                  <tr className="bg-slate-50/20">
                     <td colSpan={5} className="px-10 py-0">
                        <Accordion type="single" collapsible className="w-full">
                           <AccordionItem value="insights" className="border-0">
                              <AccordionTrigger className="hover:no-underline py-4">
                                 <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 ml-20">
                                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                                    Neural Evaluation Parameters
                                 </div>
                              </AccordionTrigger>
                              <AccordionContent className="pb-10 pl-20">
                                 <div className="grid grid-cols-2 gap-16">
                                    <div className="space-y-6">
                                       <div className="flex items-center gap-3">
                                          <Plus className="w-4 h-4 text-emerald-500" />
                                          <span className="text-[10px] font-black text-[#0f172a] uppercase tracking-widest">Core Capacities (Pros)</span>
                                       </div>
                                       <div className="flex flex-wrap gap-3">
                                          {pros.length > 0 ? pros.map((p: string, idx: number) => (
                                             <Badge key={idx} className="bg-white border-slate-100 text-slate-600 text-[9px] font-black uppercase tracking-widest py-2 px-4 shadow-sm rounded-xl">
                                                {p.trim()}
                                             </Badge>
                                          )) : <span className="text-[10px] text-slate-300 font-black uppercase tracking-widest italic">Inconclusive data.</span>}
                                       </div>
                                    </div>
                                    <div className="space-y-6">
                                       <div className="flex items-center gap-3">
                                          <Minus className="w-4 h-4 text-rose-500" />
                                          <span className="text-[10px] font-black text-[#0f172a] uppercase tracking-widest">Protocol Risks (Cons)</span>
                                       </div>
                                       <div className="flex flex-wrap gap-3">
                                          {cons.length > 0 ? cons.map((c: string, idx: number) => (
                                             <Badge key={idx} className="bg-white border-slate-100 text-slate-600 text-[9px] font-black uppercase tracking-widest py-2 px-4 shadow-sm rounded-xl">
                                                {c.trim()}
                                             </Badge>
                                          )) : <span className="text-[10px] text-slate-300 font-black uppercase tracking-widest italic">No critical vulnerabilities detected.</span>}
                                       </div>
                                    </div>
                                  </div>
                              </AccordionContent>
                           </AccordionItem>
                        </Accordion>
                     </td>
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
