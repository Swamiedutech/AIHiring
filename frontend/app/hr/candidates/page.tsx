"use client";
import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { hrApi, adminApi } from "@/lib/api";
import { useRouter } from "next/navigation";
import PanelLayout from "@/components/shared/PanelLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Users, Search, Filter, ChevronRight, 
  Download, MoreVertical, Calendar, 
  ArrowUpRight, ArrowDownRight, Eye, Edit, Trash2,
  Activity, Briefcase, Target, Clock, FilterX, Globe
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function CandidateStatCard({ label, value, isActive, onClick }: { label: string, value: string | number, isActive?: boolean, onClick?: () => void }) {
  return (
    <Card 
      onClick={onClick}
      className={cn(
        "border-border/40 shadow-md transition-all cursor-pointer group",
        isActive && "border-primary/50 shadow-lg shadow-primary/10 bg-primary/5"
      )}
    >
      <CardContent className="p-4">
        <p className="text-[9px] font-black uppercase text-muted-foreground tracking-widest mb-1 group-hover:text-primary transition-colors">{label}</p>
        <p className="text-xl font-black text-foreground tracking-tighter tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

export default function CandidatesPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [selectedApp, setSelectedApp] = useState<any>(null);
  const [isDecisionOpen, setIsDecisionOpen] = useState(false);
  const [decisionReason, setDecisionReason] = useState("");
  const [decisionType, setDecisionType] = useState("");
  const queryClient = useQueryClient();

  // --- QUERIES ---
  const { data: applicationsRaw } = useQuery({
    queryKey: ["hr-applications", search, roleFilter, statusFilter, sourceFilter, dateFilter],
    queryFn: () => hrApi.getApplications({ 
      search, 
      role: roleFilter !== 'all' ? roleFilter : undefined,
      status: statusFilter !== 'all' ? statusFilter : undefined
    }).then(r => r.data?.data || r.data || []),
  });

  const makeDecisionMutation = useMutation({
    mutationFn: async ({ id, decision, reason }: { id: string, decision: string; reason: string }) => 
      (await hrApi.makeDecision(id, { decision, reason, comments: "" })).data,
    onSuccess: () => {
      toast.success("Hiring pipeline updated successfully");
      setIsDecisionOpen(false);
      setSelectedApp(null);
      setDecisionReason("");
      queryClient.invalidateQueries({ queryKey: ["hr-applications"] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || "Decision failed");
    }
  });

  const handleQuickDecision = (app: any) => {
    setSelectedApp(app);
    setDecisionType("SEND_TO_ASSESSMENT");
    setDecisionReason("Approved for next stage based on profile match.");
    setIsDecisionOpen(true);
  };

  const { data: jobsRaw } = useQuery({
    queryKey: ["hr-jobs"],
    queryFn: () => hrApi.getJobs().then(r => r.data?.data || []),
  });

  // --- PROCESSED DATA ---
  const applications = useMemo(() => {
    let filtered = applicationsRaw || [];
    
    // Client-side filtering for source/date if backend doesn't support them yet
    if (sourceFilter !== "all") {
      filtered = filtered.filter((app: any) => app.source === sourceFilter);
    }

    // Sort by score in descending order
    filtered = [...filtered].sort((a: any, b: any) => {
      const scoreA = a.aiScore ?? a.overall_score ?? 0;
      const scoreB = b.aiScore ?? b.overall_score ?? 0;
      return scoreB - scoreA;
    });

    return filtered;
  }, [applicationsRaw, sourceFilter]);

  const stats = useMemo(() => {
    if (!applicationsRaw) return [];
    const total = applicationsRaw.length;
    const active = applicationsRaw.filter((a: any) => !['REJECTED', 'SELECTED'].includes(a.status)).length;
    const selected = applicationsRaw.filter((a: any) => a.status === 'SELECTED').length;
    const rejected = applicationsRaw.filter((a: any) => a.status === 'REJECTED').length;
    
    return [
      { label: "All Candidates", value: total, filter: "all" },
      { label: "Active", value: active, filter: "active" },
      { label: "In Progress", value: applicationsRaw.filter((a: any) => a.status?.includes('IN_PROGRESS')).length, filter: "in_progress" },
      { label: "Selected", value: selected, filter: "SELECTED" },
      { label: "Rejected", value: rejected, filter: "REJECTED" },
      { label: "Talent Pool", value: applicationsRaw.filter((a: any) => a.source === 'Talent Pool').length, filter: "talent_pool" },
    ];
  }, [applicationsRaw]);

  const handleExport = () => {
    if (!applications || applications.length === 0) return;
    const headers = ["Name", "Email", "Role", "Status", "Score", "Source", "Date"];
    const csvContent = [
      headers.join(","),
      ...applications.map((app: any) => [
        app.Candidate?.User?.name || "N/A",
        app.Candidate?.User?.email || "N/A",
        app.Job?.title || "N/A",
        app.status,
        app.overall_score || 0,
        app.source || "LinkedIn",
        new Date(app.createdAt).toLocaleDateString()
      ].join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `candidates_export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Candidate database exported successfully");
  };

  const handleDelete = (id: string) => {
    toast.error("Deletion restricted in production environment. Contact administrator.", {
      description: `Target ID: ${id}`
    });
  };

  return (
    <PanelLayout title="Candidates" allowedRoles={["HR", "ADMIN"]}>
      <div className="max-w-[1600px] mx-auto space-y-8 p-4 md:p-8 animate-in fade-in slide-in-from-bottom-4 duration-1000">
        
        {/* HEADER */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
           <div className="space-y-1">
              <h1 className="text-2xl font-black text-foreground tracking-tight flex items-center gap-2 uppercase">Candidates</h1>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Manage and monitor all candidates in your organization</p>
           </div>
           <div className="flex flex-wrap items-center gap-3">
              <div className="relative group">
                 <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                 <Input 
                    className="pl-10 h-10 w-64 bg-muted/30 border-border/50 rounded-xl text-xs font-medium" 
                    placeholder="Search candidates, roles, skills..." 
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                 />
              </div>
              <Button onClick={handleExport} variant="outline" className="h-10 rounded-xl border-border/50 text-xs font-black uppercase tracking-widest gap-2 hover:bg-primary/10 transition-colors">
                 <Download className="w-4 h-4" /> Export
              </Button>
              {/* REMOVED ADD CANDIDATE BUTTON AS REQUESTED */}
           </div>
        </div>

        {/* STATS ROW */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
           {stats.map((s, i) => (
              <CandidateStatCard 
                key={i} 
                label={s.label} 
                value={s.value} 
                isActive={statusFilter === s.filter}
                onClick={() => setStatusFilter(s.filter)}
              />
           ))}
        </div>

        {/* FILTERS & TABLE */}
        <Card className="border-border/40 shadow-sm rounded-lg overflow-hidden border-t-2 border-t-primary/20">
           <CardHeader className="border-b border-white/5 px-8 py-5 flex flex-wrap items-center gap-4">
              <div className="flex-1 min-w-[200px]">
                 <CardTitle className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
                    <Activity className="w-4 h-4 text-primary" /> Candidate Database
                 </CardTitle>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                 <select 
                    className="bg-muted/30 border-border/50 rounded-lg h-8 px-3 text-[9px] font-black uppercase focus:ring-primary/20 cursor-pointer"
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value)}
                 >
                    <option value="all">All Roles</option>
                    {jobsRaw?.map((j: any) => <option key={j.id} value={j.title}>{j.title}</option>)}
                 </select>
                 <select 
                    className="bg-muted/30 border-border/50 rounded-lg h-8 px-3 text-[9px] font-black uppercase focus:ring-primary/20 cursor-pointer"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                 >
                    <option value="all">All Status</option>
                    <option value="APPLIED">Applied</option>
                    <option value="SCREENING">Screening</option>
                    <option value="INTERVIEW_COMPLETED">Interviewed</option>
                    <option value="SELECTED">Selected</option>
                    <option value="REJECTED">Rejected</option>
                 </select>
                 <select 
                    className="bg-muted/30 border-border/50 rounded-lg h-8 px-3 text-[9px] font-black uppercase focus:ring-primary/20 cursor-pointer"
                    value={sourceFilter}
                    onChange={(e) => setSourceFilter(e.target.value)}
                 >
                    <option value="all">Source</option>
                    <option value="LinkedIn">LinkedIn</option>
                    <option value="Indeed">Indeed</option>
                    <option value="Referral">Referral</option>
                    <option value="Direct">Direct</option>
                 </select>
                 <Button variant="outline" size="sm" className="h-8 text-[9px] font-black uppercase gap-2 hover:bg-primary/5">
                    <Calendar className="w-3 h-3" /> Date Range
                 </Button>
                 {(roleFilter !== 'all' || statusFilter !== 'all' || sourceFilter !== 'all') && (
                    <Button variant="ghost" onClick={() => { setRoleFilter('all'); setStatusFilter('all'); setSourceFilter('all'); }} className="h-8 w-8 p-0 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10">
                       <FilterX className="w-4 h-4" />
                    </Button>
                 )}
              </div>
           </CardHeader>
           <CardContent className="p-0">
              <div className="overflow-x-auto custom-scrollbar">
                 <table className="w-full text-left border-collapse">
                    <thead className="text-[9px] font-black uppercase text-muted-foreground/50 tracking-widest bg-muted/10 border-b border-border/10">
                       <tr>
                          <th className="px-8 py-5">Candidate</th>
                          <th className="px-8 py-5">Role</th>
                          <th className="px-8 py-5">Stage</th>
                          <th className="px-8 py-5 text-center">Score</th>
                          <th className="px-8 py-5">Source</th>
                          <th className="px-8 py-5">Added On</th>
                          <th className="px-8 py-5 text-right">Actions</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-border/10">
                       {applications && applications.length > 0 ? applications.map((app: any, i: number) => {
                          const user = app.Candidate?.User;
                          const job = app.Job;
                          return (
                          <tr key={app.id || i} className="hover:bg-primary/5 transition-all duration-300 group">
                             <td className="px-8 py-5">
                                <div className="flex items-center gap-4">
                                   <div className="w-10 h-10 rounded-lg bg-muted border border-border/50 overflow-hidden shadow-sm group-hover:border-primary/40 transition-colors">
                                      <img 
                                         src={app.candidateId?.profileImage || "/images/default-avatar.png"} 
                                         alt="Avatar" 
                                         className="w-full h-full object-cover" 
                                         onError={(e: any) => { e.target.src = "/images/default-avatar.png"; }}
                                      />
                                   </div>
                                   <div>
                                      <p className="text-[11px] font-black text-foreground uppercase tracking-tight group-hover:text-primary transition-colors">{user?.name || "Candidate"}</p>
                                      <p className="text-[8px] font-bold text-muted-foreground lowercase truncate max-w-[150px]">{user?.email || "n/a"}</p>
                                   </div>
                                </div>
                             </td>
                             <td className="px-8 py-5">
                                <div className="flex flex-col">
                                   <span className="text-[10px] font-black text-muted-foreground uppercase">{job?.title || "N/A"}</span>
                                   <span className="text-[8px] font-bold text-muted-foreground/40 uppercase tracking-widest">{job?.department || "General"}</span>
                                </div>
                             </td>
                             <td className="px-8 py-5">
                                <Badge variant="outline" className={cn(
                                   "text-[8px] font-black uppercase border-none px-2 h-5",
                                   app.status === "SELECTED" ? "bg-emerald-500/10 text-emerald-500" :
                                   app.status === "REJECTED" ? "bg-rose-500/10 text-rose-500" :
                                   app.status === "HR_REVIEW" ? "bg-purple-500/10 text-purple-500" :
                                   "bg-primary/10 text-primary"
                                )}>{app.status?.replace(/_/g, ' ') || "SCREENING"}</Badge>
                             </td>
                             <td className="px-8 py-5 text-center">
                                <div className="inline-flex flex-col items-center">
                                   <span className="text-[11px] font-black text-foreground tabular-nums">{Math.round(app.aiScore ?? app.overall_score ?? 0)}%</span>
                                   <div className="w-12 h-1 bg-muted rounded-full mt-1 overflow-hidden">
                                      <div className="h-full bg-primary" style={{ width: `${app.aiScore ?? app.overall_score ?? 0}%` }} />
                                   </div>
                                </div>
                             </td>
                             <td className="px-8 py-5">
                                <div className="flex items-center gap-1.5 text-[9px] font-bold text-muted-foreground uppercase tracking-widest">
                                   <Globe className="w-3 h-3 opacity-30" />
                                   {app.source || "LinkedIn"}
                                </div>
                             </td>
                             <td className="px-8 py-5">
                                <div className="flex items-center gap-1.5 text-[9px] font-bold text-muted-foreground uppercase tracking-widest">
                                   <Clock className="w-3 h-3 opacity-30" />
                                   {app.createdAt && !isNaN(new Date(app.createdAt).getTime()) ? new Date(app.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : "N/A"}
                                </div>
                             </td>
                             <td className="px-8 py-5 text-right">
                                <div className="flex justify-end gap-2 opacity-30 group-hover:opacity-100 transition-all">
                                   <Link href={`/hr/applications/${app.id}`}>
                                      <Button variant="ghost" size="icon" className="w-9 h-9 rounded-xl hover:bg-primary/10 text-primary transition-all hover:scale-110"><Eye className="w-4.5 h-4.5" /></Button>
                                   </Link>
                                   <Button variant="ghost" onClick={() => handleQuickDecision(app)} size="icon" className="w-9 h-9 rounded-xl hover:bg-emerald-500/10 text-emerald-500 transition-all hover:scale-110"><Edit className="w-4.5 h-4.5" /></Button>
                                   <Button variant="ghost" onClick={() => handleDelete(app.id)} size="icon" className="w-9 h-9 rounded-xl hover:bg-rose-500/10 text-rose-500 transition-all hover:scale-110"><Trash2 className="w-4.5 h-4.5" /></Button>
                                </div>
                             </td>
                          </tr>
                       )}) : (
                         <tr>
                            <td colSpan={7} className="py-20 text-center">
                               <div className="flex flex-col items-center opacity-20">
                                  <Users className="w-12 h-12 mb-4" />
                                  <p className="text-[10px] font-black uppercase tracking-[0.2em]">No candidates found matching criteria</p>
                               </div>
                            </td>
                         </tr>
                       )}
                    </tbody>
                 </table>
              </div>
              <div className="px-8 py-5 flex items-center justify-between border-t border-border/10 bg-muted/5">
                 <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Showing {applications?.length || 0} of {applicationsRaw?.length || 0} organizational assets</span>
                 <div className="flex gap-1.5">
                    <Button variant="outline" disabled className="h-8 px-4 text-[10px] font-black rounded-xl border-border/40 uppercase tracking-widest opacity-50 cursor-not-allowed">Previous</Button>
                    <Button variant="outline" disabled className="h-8 px-4 text-[10px] font-black rounded-xl border-primary/40 text-primary uppercase tracking-widest bg-primary/5">1</Button>
                    <Button variant="outline" disabled className="h-8 px-4 text-[10px] font-black rounded-xl border-border/40 uppercase tracking-widest opacity-50 cursor-not-allowed">Next</Button>
                 </div>
              </div>
           </CardContent>
        </Card>

        {/* QUICK DECISION DIALOG */}
        <Dialog open={isDecisionOpen} onOpenChange={setIsDecisionOpen}>
          <DialogContent className="sm:max-w-[425px] rounded-lg border-border/40 shadow-sm">
            <DialogHeader>
              <DialogTitle className="text-xl font-black uppercase tracking-tight text-foreground">Pipeline Decision</DialogTitle>
              <DialogDescription className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Decide the next stage for {selectedApp?.Candidate?.User?.name}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground pl-1">Action Stage</label>
                <Select value={decisionType} onValueChange={setDecisionType}>
                  <SelectTrigger className="rounded-xl border-border/50 h-10 text-xs font-bold uppercase tracking-widest">
                    <SelectValue placeholder="Select Stage" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-border/40 shadow-xl">
                    <SelectItem value="SEND_TO_ASSESSMENT">Approve for Assessment</SelectItem>
                    <SelectItem value="APPROVE_FOR_INTERVIEW">Approve for Interview</SelectItem>
                    <SelectItem value="REQUEST_RE_ASSESSMENT">Request Re-assessment</SelectItem>
                    <SelectItem value="REQUEST_RE_INTERVIEW">Request Re-interview</SelectItem>
                    <SelectItem value="FINAL_SELECTION">Final Selection</SelectItem>
                    <SelectItem value="SEND_OFFER">Send Offer Letter</SelectItem>
                    <SelectItem value="ON_HOLD">Put on Hold</SelectItem>
                    <SelectItem value="REJECTED">Reject Candidate</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground pl-1">HR Rationale / Reason</label>
                <Textarea 
                  className="rounded-xl border-border/50 text-xs min-h-[100px] bg-muted/20"
                  placeholder="Enter reason for this decision..."
                  value={decisionReason}
                  onChange={(e) => setDecisionReason(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button 
                variant="ghost" 
                onClick={() => setIsDecisionOpen(false)}
                className="text-[10px] font-black uppercase tracking-widest"
              >
                Cancel
              </Button>
              <Button 
                onClick={() => makeDecisionMutation.mutate({ 
                  id: selectedApp.id, 
                  decision: decisionType, 
                  reason: decisionReason 
                })}
                disabled={makeDecisionMutation.isPending || !decisionReason}
                className="rounded-xl bg-primary text-primary-foreground text-[10px] font-black uppercase tracking-widest px-6 h-10 shadow-lg shadow-primary/20"
              >
                {makeDecisionMutation.isPending ? "Executing..." : "Confirm Decision"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </PanelLayout>
  );
}
