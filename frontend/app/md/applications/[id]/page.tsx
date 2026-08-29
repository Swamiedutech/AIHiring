"use client";
import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { hrApi } from "@/lib/api";
import api, { BACKEND_URL } from "@/lib/api";
import PanelLayout from "@/components/shared/PanelLayout";
import dynamic from "next/dynamic";

const AIDecisionPanel = dynamic(
  () => import("@/components/ai/AIDecisionPanel").then(m => m.AIDecisionPanel),
  { ssr: false, loading: () => <div className="animate-pulse h-64 rounded-xl bg-muted/30 border border-border/40" /> }
);
const AssessmentAnalysisPanel = dynamic(
  () => import("@/components/ai/AssessmentAnalysisPanel").then(m => m.AssessmentAnalysisPanel),
  { ssr: false, loading: () => <div className="animate-pulse h-48 rounded-xl bg-muted/30 border border-border/40" /> }
);
const InterviewAnalysisPanel = dynamic(
  () => import("@/components/ai/InterviewAnalysisPanel").then(m => m.InterviewAnalysisPanel),
  { ssr: false, loading: () => <div className="animate-pulse h-48 rounded-xl bg-muted/30 border border-border/40" /> }
);
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FileText, TrendingUp, ShieldCheck, Download,
  ChevronLeft, BarChart2, BrainCircuit, CheckCircle, XCircle, Loader2, User,
  Mail, MapPin, Briefcase, GraduationCap, Star, Code, X, Phone
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function MDApplicationReview() {
  const { id } = useParams();
  const router = useRouter();
  const applicationId = Number(id);
  const queryClient = useQueryClient();
  const [confirmDialog, setConfirmDialog] = useState<'APPROVED' | 'REJECTED' | null>(null);
  const [mdNotes, setMdNotes] = useState('');

  const { data: appResponse, isLoading } = useQuery({
    queryKey: ["hr-application", applicationId],
    queryFn: async () => (await hrApi.getCandidateProfile(String(applicationId))).data,
    refetchInterval: 5000,
  });

  const app = appResponse?.data;
  const candidateName = app?.candidate?.name || app?.candidateName || '—';
  const candidateEmail = app?.candidate?.email || '—';
  const jobTitle = app?.job?.title || app?.jobTitle || '—';
  const department = app?.job?.department || '—';
  const overallScore = Math.round(app?.aiScore || app?.overall_score || 0);
  const integrityScore = app?.integrityScore ?? app?.candidate?.integrity_score ?? 100;

  // Candidate profile info
  const candidate = app?.candidate || {};
  const resumeDetails = app?.ResumeAnalysis || null;

  const education = candidate?.education || app?.education || resumeDetails?.education || '—';
  const specialization = candidate?.specialization || app?.specialization || '—';
  const experience = candidate?.experience || app?.experience_years || resumeDetails?.total_years_experience || 0;
  
  let skills = candidate?.skills?.length ? candidate.skills : (app?.skills?.length ? app.skills : (resumeDetails?.skills || []));
  if (typeof skills === 'string') {
    try { skills = JSON.parse(skills); } catch { skills = skills.split(',').map((s: string) => s.trim()); }
  }
  
  const summary = candidate?.summary || app?.summary || resumeDetails?.ai_summary || resumeDetails?.overall_assessment || '';
  const domain = candidate?.domain || app?.domain || '—';
  const areaOfInterest = candidate?.area_of_interest || app?.area_of_interest || '—';
  const currentCompany = candidate?.current_company || app?.current_company || '—';
  const candidateType = candidate?.candidate_type || app?.candidate_type || '—';
  const phone = candidate?.phone || '—';
  const location = candidate?.location || candidate?.working_address || '—';
  const profileImage = candidate?.profileImage || candidate?.profile_image_path ? `${BACKEND_URL}${candidate.profile_image_path?.startsWith('/') ? '' : '/'}${candidate.profile_image_path}` : null;

  // Resume parsed data
  // The backend might not send ResumeAnalysis directly, let's check evaluationProsCons or use it if available
  const resumeAnalysis = app?.ResumeAnalysis || app?.evaluationProsCons?.find?.((e: any) => e.stage === 'RESUME_PARSING') || null;

  const hasDecision = ['APPROVED','REJECTED','MD_RECOMMENDED','MD_REJECTED'].includes(app?.final_decision);

  const { mutate: makeDecision, isPending: isDeciding } = useMutation({
    mutationFn: (decision: 'APPROVED' | 'REJECTED') =>
      api.post('/md/decision', { application_id: applicationId, decision, md_notes: mdNotes || null }),
    onSuccess: (res) => {
      const d = res.data;
      toast.success(d.decision === 'APPROVED'
        ? `✅ ${d.candidateName} recommended to HR`
        : `❌ ${d.candidateName} rejected for HR review`);
      setConfirmDialog(null);
      setMdNotes('');
      queryClient.invalidateQueries({ queryKey: ['hr-application', applicationId] });
      router.push('/md');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Decision failed'),
  });

  const handleDownloadReport = async () => {
    try {
      const res = await hrApi.getExecutiveReport(String(applicationId));
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `EXECUTIVE_REPORT_${applicationId}.pdf`);
      document.body.appendChild(link);
      link.click();
      toast.success('Executive PDF Generated');
    } catch (e) {
      toast.error('Failed to generate report');
    }
  };

  if (isLoading) return (
    <PanelLayout title="Executive Approval Terminal" allowedRoles={['MD', 'ADMIN']}>
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    </PanelLayout>
  );

  return (
    <PanelLayout title="Executive Approval Terminal" allowedRoles={['MD', 'ADMIN']}>
      <div className="max-w-7xl mx-auto p-6 space-y-6">

        {/* 2-STEP CONFIRMATION DIALOG */}
        <Dialog open={!!confirmDialog} onOpenChange={(open) => { if (!open) { setConfirmDialog(null); setMdNotes(''); } }}>
          <DialogContent className="max-w-lg bg-white border-slate-100 rounded-xl shadow-2xl p-0 overflow-hidden">
            <div className={cn(
              "px-6 py-4 border-b",
              confirmDialog === 'APPROVED' ? "bg-emerald-50 border-emerald-100" : "bg-rose-50 border-rose-100"
            )}>
              <DialogHeader>
                <DialogTitle className="text-sm font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
                  {confirmDialog === 'APPROVED' ? <CheckCircle className="w-4 h-4 text-emerald-600" /> : <XCircle className="w-4 h-4 text-rose-600" />}
                  {confirmDialog === 'APPROVED' ? 'Confirm Recommendation' : 'Confirm Rejection'}
                </DialogTitle>
                <DialogDescription className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-1">
                  Step 2 of 2 — Verification Required
                </DialogDescription>
              </DialogHeader>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div className={cn("p-4 rounded-lg border", confirmDialog === 'APPROVED' ? "bg-emerald-50/50 border-emerald-100" : "bg-rose-50/50 border-rose-100")}>
                <p className="text-xs text-slate-600">
                  {confirmDialog === 'APPROVED'
                    ? <>Do you really want to <span className="font-black text-emerald-700">recommend</span> candidate <span className="font-black text-slate-900">{candidateName}</span> to HR?</>
                    : <>Do you really want to <span className="font-black text-rose-700">reject</span> candidate <span className="font-black text-slate-900">{candidateName}</span> for HR review?</>}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-[10px]">
                <div className="space-y-1"><span className="text-slate-400 font-bold">Name:</span> <span className="text-slate-700 font-bold block">{candidateName}</span></div>
                <div className="space-y-1"><span className="text-slate-400 font-bold">Email:</span> <span className="text-slate-700 block">{candidateEmail}</span></div>
                <div className="space-y-1"><span className="text-slate-400 font-bold">Position:</span> <span className="text-slate-700 font-bold block">{jobTitle}</span></div>
                <div className="space-y-1"><span className="text-slate-400 font-bold">AI Score:</span> <span className="text-primary font-bold block">{overallScore}%</span></div>
              </div>
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">MD Notes (Optional)</label>
                <textarea className="w-full text-xs h-16 resize-none border border-slate-200 rounded-lg p-2.5 focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none" placeholder="Add notes for HR team..." value={mdNotes} onChange={(e) => setMdNotes(e.target.value)} />
              </div>
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-100 rounded-lg">
                <Star className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                <p className="text-[10px] text-amber-700">This is a recommendation only. HR is the final authority for candidate selection and offer process.</p>
              </div>
            </div>
            <DialogFooter className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex sm:justify-between gap-3">
              <Button variant="outline" className="flex-1 h-11 font-black uppercase text-[10px] tracking-widest" onClick={() => { setConfirmDialog(null); setMdNotes(''); }} disabled={isDeciding}>Cancel</Button>
              <Button className={cn("flex-1 h-11 text-white font-black uppercase text-[10px] tracking-widest gap-2", confirmDialog === 'APPROVED' ? "bg-emerald-600 hover:bg-emerald-500" : "bg-rose-600 hover:bg-rose-500")} onClick={() => makeDecision(confirmDialog as 'APPROVED' | 'REJECTED')} disabled={isDeciding}>
                {isDeciding ? <Loader2 className="w-4 h-4 animate-spin" /> : confirmDialog === 'APPROVED' ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                {confirmDialog === 'APPROVED' ? 'Confirm Recommendation' : 'Confirm Rejection'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Header */}
        <div className="bg-white border border-slate-100 rounded-lg shadow-sm p-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center gap-5">
              <Button variant="ghost" size="icon" onClick={() => router.back()}
                className="rounded-xl border border-slate-200 hover:bg-slate-50">
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-lg bg-slate-900 flex items-center justify-center shadow-xl overflow-hidden relative">
                  {profileImage ? (
                    <img 
                      src={profileImage}
                      alt="Profile" 
                      className="w-full h-full object-cover"
                      onError={(e: any) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'block'; }}
                    />
                  ) : null}
                  <User className="w-7 h-7 text-white" style={{ display: profileImage ? 'none' : 'block' }} />
                </div>
                <div>
                  <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight leading-none">
                    {candidateName}
                  </h1>
                  <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mt-2">
                    {jobTitle} • Application #{applicationId}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <Button onClick={handleDownloadReport} variant="outline"
                className="gap-2 border-slate-200 font-bold uppercase text-[10px] tracking-widest h-11 px-5 rounded-xl">
                <Download className="w-4 h-4" /> Executive Dossier
              </Button>
              <Badge className={cn(
                'px-4 py-2 font-bold uppercase tracking-widest text-[10px] rounded-xl',
                app?.status === 'SELECTED' || app?.status === 'OFFERED' ? 'bg-emerald-100 text-emerald-700' :
                app?.status === 'REJECTED' ? 'bg-rose-100 text-rose-700' :
                'bg-slate-900 text-white'
              )}>
                {app?.status || 'Under Review'}
              </Badge>
            </div>
          </div>
        </div>

        {/* Candidate Profile Card */}
        <Card className="border-slate-100 shadow-sm rounded-xl overflow-hidden">
          <CardHeader className="bg-slate-50/50 border-b border-slate-100 px-6 py-4">
            <CardTitle className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500 flex items-center gap-2">
              <User className="w-4 h-4 text-blue-600" /> Candidate Profile
            </CardTitle>
          </CardHeader>
          <CardContent className="px-6 py-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Contact & Basic Info */}
              <div className="space-y-3">
                <h4 className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-2">Contact Info</h4>
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-slate-700 text-xs">{candidateEmail}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-slate-700 text-xs">{phone}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-slate-700 text-xs">{location}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Briefcase className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-slate-700 text-xs">{experience} years • {candidateType}</span>
                </div>
              </div>

              {/* Education & Domain */}
              <div className="space-y-3">
                <h4 className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-2">Education & Domain</h4>
                <div className="flex items-center gap-2 text-sm">
                  <GraduationCap className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-slate-700 text-xs">{education} {specialization ? `(${specialization})` : ''}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Star className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-slate-700 text-xs">Domain: {domain}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <BrainCircuit className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-slate-700 text-xs">Interest: {areaOfInterest}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Briefcase className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-slate-700 text-xs">Company: {currentCompany}</span>
                </div>
              </div>

              {/* Skills */}
              <div className="space-y-3">
                <h4 className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-2">Skills</h4>
                <div className="flex flex-wrap gap-1.5">
                  {skills.length > 0 ? skills.map((s: string, i: number) => (
                    <Badge key={i} variant="outline" className="text-[9px] font-bold bg-blue-50 text-blue-700 border-blue-200 px-2 py-0.5">
                      {s}
                    </Badge>
                  )) : (
                    <span className="text-xs text-slate-400">No skills data</span>
                  )}
                </div>
                {summary && (
                  <div className="mt-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">Summary</p>
                    <p className="text-xs text-slate-600 leading-relaxed line-clamp-3">{summary}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Resume Parsed Data */}
            {resumeAnalysis && (
              <div className="mt-5 pt-5 border-t border-slate-100">
                <h4 className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-1.5">
                  <FileText className="w-3 h-3" /> Resume Analysis
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {resumeAnalysis.experience_summary && (
                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                      <p className="text-[9px] font-bold uppercase text-slate-400 mb-1">Experience Summary</p>
                      <p className="text-xs text-slate-600">{resumeAnalysis.experience_summary}</p>
                    </div>
                  )}
                  {resumeAnalysis.overall_assessment && (
                    <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                      <p className="text-[9px] font-bold uppercase text-blue-600 mb-1">Overall Assessment</p>
                      <p className="text-xs text-slate-600">{resumeAnalysis.overall_assessment}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Score + AI Decision */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8">
            <AIDecisionPanel applicationId={applicationId} />
          </div>
          <div className="lg:col-span-4 space-y-5">
            <Card className="border-slate-100 shadow-sm rounded-[1.5rem] overflow-hidden">
              <CardHeader className="bg-slate-50/50 border-b border-slate-100 px-6 py-5">
                <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-blue-600" /> Peer Benchmarking
                </CardTitle>
              </CardHeader>
              <CardContent className="px-6 py-5 space-y-5">
                <div className="p-5 bg-slate-50 rounded-lg border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-3">Candidate vs Peer Average</p>
                  <div className="flex items-end gap-3">
                    <p className="text-4xl font-black text-slate-900 tabular-nums">{overallScore}%</p>
                    <p className="text-xs font-bold text-emerald-600 mb-1 flex items-center gap-0.5">
                      <TrendingUp className="w-3 h-3" /> +12%
                    </p>
                  </div>
                  <div className="w-full bg-slate-200 h-2 rounded-full mt-4 overflow-hidden">
                    <div className="bg-blue-600 h-full rounded-full transition-all"
                      style={{ width: `${overallScore}%` }} />
                  </div>
                </div>
                <div className="p-5 bg-blue-50/50 rounded-lg border border-blue-100">
                  <p className="text-[10px] font-bold text-blue-800 uppercase flex items-center gap-2 mb-2">
                    <ShieldCheck className="w-3 h-3" /> Integrity Verification
                  </p>
                  <p className="text-2xl font-black text-slate-900">{integrityScore}/100</p>
                  <p className="text-xs text-slate-500 mt-1">Validated via Multi-Factor Proctoring Logs</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Deep Dive Panels */}
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <BrainCircuit className="w-4 h-4 text-slate-400" />
            <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Technical &amp; Behavioral Deep-Dive</h3>
          </div>
          <AssessmentAnalysisPanel applicationId={applicationId} />

          <div className="flex items-center gap-2 pt-4">
            <FileText className="w-4 h-4 text-slate-400" />
            <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Interview Highlights (6 Dimensions)</h3>
          </div>
          <InterviewAnalysisPanel applicationId={applicationId} />
        </div>

        {/* MD Recommendation Bar */}
        <div className="bg-slate-900/5 border border-slate-200 p-8 rounded-xl shadow-sm flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h2 className="text-xl font-black uppercase tracking-tight text-slate-800">MD Recommendation to HR</h2>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-2">
              Your recommendation will be sent to HR for final decision. Application #{applicationId}.
            </p>
          </div>
          {hasDecision ? (
            <Badge className={cn('px-6 py-3 text-sm font-black uppercase tracking-widest rounded-xl',
              app?.final_decision === 'MD_RECOMMENDED' || app?.final_decision === 'APPROVED'
                ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                : 'bg-rose-100 text-rose-700 border border-rose-200'
            )}>
              {app?.final_decision === 'MD_RECOMMENDED' || app?.final_decision === 'APPROVED' ? 'Recommended to HR' : 'Rejected for HR Review'}
            </Badge>
          ) : (
            <div className="flex items-center gap-4 w-full md:w-auto">
              <Button
                size="lg"
                className="flex-1 md:flex-none h-16 px-12 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black uppercase text-sm tracking-widest shadow-xl shadow-rose-900/20 transition-all gap-3"
                onClick={() => setConfirmDialog('REJECTED')}
                disabled={isDeciding}
              >
                <XCircle className="w-5 h-5" />
                Reject
              </Button>
              <Button
                size="lg"
                className="flex-1 md:flex-none h-16 px-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase text-sm tracking-widest shadow-xl shadow-emerald-900/20 transition-all gap-3"
                onClick={() => setConfirmDialog('APPROVED')}
                disabled={isDeciding}
              >
                <CheckCircle className="w-5 h-5" />
                Recommend
              </Button>
            </div>
          )}
        </div>

      </div>
    </PanelLayout>
  );
}
