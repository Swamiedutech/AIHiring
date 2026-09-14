"use client";
import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { hrApi } from "@/lib/api";
import { useRouter } from "next/navigation";
import PanelLayout from "@/components/shared/PanelLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Users, Clock, CheckCircle, TrendingUp, AlertTriangle, AlertCircle,
  ArrowUpRight, ArrowDownRight, Activity, Calendar, MessageCircle, ShieldCheck,
  Trophy, Star, Loader2, ExternalLink, Zap, Brain, BarChart3, PieChart as PieIcon,
  Search, Filter, Plus, ChevronRight, Target, LayoutDashboard, FileText, Briefcase,
  Layers, MousePointer2, RefreshCw, Shield
} from "lucide-react";
import dynamic from "next/dynamic";

const BarChart = dynamic(() => import("recharts").then((mod) => mod.BarChart), { ssr: false });
const Bar = dynamic(() => import("recharts").then((mod) => mod.Bar), { ssr: false });
const XAxis = dynamic(() => import("recharts").then((mod) => mod.XAxis), { ssr: false });
const YAxis = dynamic(() => import("recharts").then((mod) => mod.YAxis), { ssr: false });
const CartesianGrid = dynamic(() => import("recharts").then((mod) => mod.CartesianGrid), { ssr: false });
const Tooltip = dynamic(() => import("recharts").then((mod) => mod.Tooltip), { ssr: false });
const ResponsiveContainer = dynamic(() => import("recharts").then((mod) => mod.ResponsiveContainer), { ssr: false });
const Legend = dynamic(() => import("recharts").then((mod) => mod.Legend), { ssr: false });
const LineChart = dynamic(() => import("recharts").then((mod) => mod.LineChart), { ssr: false });
const Line = dynamic(() => import("recharts").then((mod) => mod.Line), { ssr: false });
const PieChart = dynamic(() => import("recharts").then((mod) => mod.PieChart), { ssr: false });
const Pie = dynamic(() => import("recharts").then((mod) => mod.Pie), { ssr: false });
const Cell = dynamic(() => import("recharts").then((mod) => mod.Cell), { ssr: false });
const AreaChart = dynamic(() => import("recharts").then((mod) => mod.AreaChart), { ssr: false });
const Area = dynamic(() => import("recharts").then((mod) => mod.Area), { ssr: false });

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function KPICard({ title, value, trend, trendValue, icon: Icon, sparkData, color }: {
  title: string; value: string | number; trend: "up" | "down";
  trendValue: string; icon: any; sparkData: any[]; color: string;
}) {
  return (
    <Card className="border-border/40 shadow-sm hover:shadow-md transition-all duration-300 group overflow-hidden">
      <CardContent className="p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className={cn("p-1.5 rounded-md bg-muted/50 border border-border/50", color)}>
              <Icon className="w-3.5 h-3.5" />
            </div>
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{title}</span>
          </div>
          <ArrowUpRight className="w-3 h-3 text-muted-foreground/30 group-hover:text-primary transition-colors" />
        </div>
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xl font-bold text-foreground tracking-tight tabular-nums">{value ?? "—"}</p>
            <div className={cn(
              "flex items-center gap-1 text-[9px] font-bold mt-0.5 uppercase tracking-wider",
              trend === "up" ? "text-emerald-500" : "text-rose-500"
            )}>
              {trend === "up" ? <ArrowUpRight className="w-2.5 h-2.5" /> : <ArrowDownRight className="w-2.5 h-2.5" />}
              {trendValue}
            </div>
          </div>
          <div className="h-8 w-20">
            <ResponsiveContainer minWidth={1} minHeight={1} width="100%" height="100%">
              <AreaChart data={sparkData}>
                <Area type="monotone" dataKey="v" stroke={trend === "up" ? "#14b8a6" : "#f43f5e"} fill={trend === "up" ? "#14b8a610" : "#f43f5e10"} strokeWidth={1.5} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function HRDashboard() {
  const router = useRouter();
  const [pipelineView, setPipelineView] = useState<"funnel" | "flow">("funnel");

  // --- QUERIES (REAL-TIME FETCHING) ---
  const { data: kpiData } = useQuery({
    queryKey: ["hr-kpi"],
    queryFn: () => hrApi.getKPICards().then(r => r.data?.data || {}),
    refetchInterval: 30_000,
  });

  const { data: funnelDataRaw } = useQuery({
    queryKey: ["hr-funnel"],
    queryFn: () => hrApi.getHiringFunnel().then(r => r.data?.data || []),
    refetchInterval: 30_000,
  });

  const { data: distributionRaw } = useQuery({
    queryKey: ["hr-distribution"],
    queryFn: () => hrApi.getStatusDistribution().then(r => r.data?.data || []),
    refetchInterval: 30_000,
  });

  const { data: pendingRaw } = useQuery({
    queryKey: ["hr-pending"],
    queryFn: () => hrApi.getPendingActions().then(r => r.data?.data || []),
    refetchInterval: 30_000,
  });

  const { data: topCandidatesRaw } = useQuery({
    queryKey: ["hr-top-candidates"],
    queryFn: () => hrApi.getTopCandidates().then(r => r.data?.data || []),
    refetchInterval: 30_000,
  });

  const { data: opsCore } = useQuery({
    queryKey: ["hr-ops-core"],
    queryFn: () => hrApi.getOperationalCore().then(r => r.data?.data || {}),
    refetchInterval: 30_000,
  });

  const { data: mdDecisionsRaw } = useQuery({
    queryKey: ["hr-md-decisions"],
    queryFn: () => hrApi.getMDDecisions().then(r => r.data?.data || []),
    refetchInterval: 10000,
  });

  const { data: recentHiresRaw } = useQuery({
    queryKey: ["hr-recent-hires"],
    queryFn: () => hrApi.getRecentHires().then(r => r.data?.data || []),
    refetchInterval: 10000,
  });

  // --- MOCK / PROCESSED DATA ---
  const sparkData = [{ v: 40 }, { v: 45 }, { v: 42 }, { v: 50 }, { v: 48 }, { v: 55 }, { v: 60 }];

  const funnelData = (funnelDataRaw && funnelDataRaw.length > 0) ? funnelDataRaw.map((f: any) => ({
    stage: (f.stage || "").replace(/_/g, ' '),
    count: Number(f.count || 0),
    conversion: f.dropoff === 0 ? 100 : 100 - (f.dropoff || 0)
  })) : [];

  const distributionData = (distributionRaw && distributionRaw.length > 0) ? distributionRaw.map((d: any, i: number) => ({
    name: d.label || d.status || d.name || 'Unknown',
    value: Number(d.value || d.count || 0),
    color: ['#14b8a6', '#0ea5e9', '#f59e0b', '#8b5cf6', '#f43f5e'][i % 5]
  })) : [];

  const topCandidate = topCandidatesRaw?.[0] || null;

  return (
    <PanelLayout title="HR Dashboard" allowedRoles={["HR", "ADMIN"]}>
      <div className="max-w-[1600px] mx-auto space-y-4 p-3 md:p-5 animate-in fade-in duration-500">

        {/* Header Controls */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-1">
          <div className="space-y-0.5">
            <h1 className="text-lg font-bold text-foreground tracking-tight flex items-center gap-2 uppercase">Dashboard</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative group">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <Input className="pl-8 h-8 w-60 bg-white/40 border-white/30 rounded-xl text-xs font-medium" placeholder="Search candidates, roles, skills..." />
            </div>
          </div>
        </div>

        {/* KPI GRID */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <KPICard title="Total Candidates" value={kpiData?.totalCandidates || "0"} trend="up" trendValue="18.6%" icon={Users} sparkData={sparkData} color="text-primary" />
          <KPICard title="In Pipeline" value={kpiData?.pendingReview || "0"} trend="up" trendValue="8.3%" icon={TrendingUp} sparkData={sparkData} color="text-amber-500" />
          <KPICard title="Interviews" value={kpiData?.pendingReview || "0"} trend="up" trendValue="21.7%" icon={MessageCircle} sparkData={sparkData} color="text-purple-500" />
          <KPICard title="Offers" value={kpiData?.selected || "0"} trend="up" trendValue="14.2%" icon={CheckCircle} sparkData={sparkData} color="text-emerald-500" />
          <KPICard title="Hires" value={kpiData?.selected || "0"} trend="up" trendValue="12.5%" icon={Trophy} sparkData={sparkData} color="text-primary" />
          <KPICard title="Avg Time to Hire" value={`${kpiData?.avgTimeToHire || 0}d`} trend="down" trendValue="5.6%" icon={Clock} sparkData={sparkData} color="text-rose-500" />
        </div>

        {/* ROW 2: Pipeline & AI Insights */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

          {/* Pipeline Overview */}
          <Card className="lg:col-span-6 border-border/40 shadow-sm rounded-2xl overflow-hidden">
            <CardHeader className="border-b border-border/40 px-4 py-2.5 flex flex-row items-center justify-between bg-muted/20">
              <CardTitle className="text-[11px] font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-primary" /> Pipeline Overview
              </CardTitle>
              <div className="flex bg-muted/40 p-0.5 rounded-md gap-0.5">
                <Button
                  variant="ghost"
                  onClick={() => setPipelineView("funnel")}
                  className={cn("h-6 px-2 text-[9px] font-bold uppercase tracking-wider transition-all", pipelineView === "funnel" ? "bg-white shadow-sm text-primary" : "opacity-60")}
                >Funnel</Button>
                <Button
                  variant="ghost"
                  onClick={() => setPipelineView("flow")}
                  className={cn("h-6 px-2 text-[9px] font-bold uppercase tracking-wider transition-all", pipelineView === "flow" ? "bg-white shadow-sm text-primary" : "opacity-60")}
                >Flow</Button>
              </div>
            </CardHeader>
            <CardContent className="p-4">
              {pipelineView === "funnel" ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                  <div className="h-[180px]">
                    <ResponsiveContainer minWidth={1} minHeight={1} width="100%" height="100%">
                      <BarChart data={funnelData} layout="vertical" margin={{ left: -30, right: 0, top: 0, bottom: 0 }}>
                        <XAxis type="number" hide />
                        <YAxis dataKey="stage" type="category" hide />
                        <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={20}>
                          {funnelData.map((entry: any, index: number) => (
                            <Cell key={`cell-${index}`} fill={['#14b8a6', '#0ea5e9', '#8b5cf6', '#f59e0b', '#f43f5e', '#ec4899'][index % 6]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-2">
                    <table className="w-full text-left">
                      <thead className="text-[9px] font-bold uppercase text-muted-foreground tracking-wider">
                        <tr>
                          <th className="pb-2">Stage</th>
                          <th className="pb-2">Candidates</th>
                          <th className="pb-2 text-right">Conv.</th>
                        </tr>
                      </thead>
                      <tbody className="text-[10px] font-medium text-foreground">
                        {funnelData.map((row: { stage: string; count: number; conversion: number }, i: number) => (
                          <tr key={i} className="border-t border-border/40">
                            <td className="py-1.5 flex items-center gap-1.5">
                              <div className="w-1.5 h-1.5 rounded-sm" style={{ backgroundColor: ['#14b8a6', '#0ea5e9', '#8b5cf6', '#f59e0b', '#f43f5e', '#ec4899'][i % 6] }}></div>
                              <span className="truncate max-w-[100px]">{row.stage}</span>
                            </td>
                            <td className="py-1.5">{row.count}</td>
                            <td className="py-1.5 text-right font-bold text-primary">{row.conversion}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="h-[180px] flex items-center justify-center relative overflow-hidden">
                  <div className="flex items-center gap-4 z-10">
                    {funnelData.slice(0, 4).map((f: { stage: string; count: number }, i: number) => {
                      const Icons = [Search, Briefcase, MessageCircle, Star];
                      const Icon = Icons[i % Icons.length];
                      return (
                        <React.Fragment key={i}>
                          <div className="flex flex-col items-center gap-2 group/node">
                            <div className="w-10 h-10 rounded-lg bg-card border border-border/60 flex items-center justify-center shadow-sm z-10 group-hover/node:border-primary/50 transition-colors">
                              <Icon className="w-4 h-4 text-primary group-hover/node:scale-110 transition-transform" />
                            </div>
                            <div className="text-center">
                              <span className="text-sm font-bold text-foreground tabular-nums block">{f.count}</span>
                              <span className="text-[8px] font-bold uppercase text-muted-foreground tracking-wider leading-tight block w-14">{f.stage}</span>
                            </div>
                          </div>
                          {i < 3 && (
                            <div className="w-8 h-[1px] bg-primary/30 relative mt-[-28px]">
                              <div className="absolute inset-0 bg-primary/60 animate-pulse"></div>
                            </div>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* AI Insights & Top Candidate */}
          <div className="lg:col-span-6 grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* AI Insights */}
            <Card className="border-border/40 shadow-sm rounded-2xl overflow-hidden">
              <CardHeader className="border-b border-border/40 px-4 py-2.5 flex flex-row items-center justify-between bg-muted/20">
                <CardTitle className="text-[11px] font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                  <Brain className="w-3.5 h-3.5 text-amber-500" /> AI Insights
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 space-y-2.5">
                {[
                  { title: 'Top Performer', desc: topCandidate ? `${topCandidate.name} is in top 5%` : 'No data yet', score: topCandidate ? `${topCandidate.score}/100` : 'N/A', icon: Star, color: 'text-amber-500', bg: 'bg-amber-500/10' },
                  { title: 'Risk Alert', desc: `${kpiData?.rejected || 0} flagged candidates`, score: 'High', icon: AlertCircle, color: 'text-rose-500', bg: 'bg-rose-500/10' },
                  { title: 'Bottleneck', desc: 'Assessment stage drops', score: 'Medium', icon: Target, color: 'text-amber-500', bg: 'bg-amber-500/10' },
                  { title: 'Hiring Forecast', desc: `Goal by Next Month`, score: 'On Track', icon: TrendingUp, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
                ].map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded-lg border border-border/40 bg-muted/10 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-2">
                      <div className={cn("p-1.5 rounded-md", item.bg)}>
                        <item.icon className={cn("w-3.5 h-3.5", item.color)} />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-foreground leading-none mb-0.5">{item.title}</p>
                        <p className="text-[9px] text-muted-foreground truncate max-w-[120px]">{item.desc}</p>
                      </div>
                    </div>
                    <span className={cn("text-[9px] font-bold uppercase tracking-widest", item.color)}>{item.score}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Top Candidate Spotlight */}
            {topCandidate ? (
              <Card className="border-border/40 shadow-sm rounded-2xl overflow-hidden border-t-2 border-t-emerald-500">
                <CardHeader className="border-b border-border/40 px-4 py-2.5 flex flex-row items-center justify-between bg-muted/20">
                  <CardTitle className="text-[11px] font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                    <Trophy className="w-3.5 h-3.5 text-emerald-500" /> Top Candidate
                  </CardTitle>
                  <Button variant="link" onClick={() => router.push('/hr/candidates')} className="text-[9px] font-bold uppercase p-0 h-fit text-muted-foreground hover:text-primary">View All</Button>
                </CardHeader>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-lg bg-muted border border-border/50 overflow-hidden">
                      <img
                        src={topCandidate.profileImage || "/images/default-avatar.png"}
                        alt="Top"
                        className="w-full h-full object-cover"
                        onError={(e: any) => { e.target.src = "/images/default-avatar.png"; }}
                      />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-foreground uppercase tracking-tight">{topCandidate.name}</h4>
                      <p className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider">{topCandidate.job}</p>
                      <Badge className="bg-emerald-500/10 text-emerald-500 border-none text-[8px] font-bold mt-1 px-1.5 py-0">Strong Hire</Badge>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-lg font-bold text-foreground leading-none">{topCandidate.score}<span className="text-[10px] text-muted-foreground uppercase ml-0.5">/100</span></p>
                      <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">Overall Score</p>
                    </div>
                    <div className="flex gap-1.5">
                      {['Comm', 'Logic', 'Fit'].map((k) => (
                        <Badge key={k} variant="outline" className="text-[8px] font-bold uppercase border-border/60 px-1 py-0">{k}</Badge>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mb-4 border-t border-border/40 pt-3">
                    <div className="text-center">
                      <p className="text-[11px] font-bold text-foreground">3.2 Yrs</p>
                      <p className="text-[8px] font-medium text-muted-foreground uppercase tracking-wider">Exp</p>
                    </div>
                    <div className="text-center border-x border-border/40">
                      <p className="text-[11px] font-bold text-foreground">{topCandidate.integrityScore}%</p>
                      <p className="text-[8px] font-medium text-muted-foreground uppercase tracking-wider">Fit</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[11px] font-bold text-emerald-500">Low</p>
                      <p className="text-[8px] font-medium text-muted-foreground uppercase tracking-wider">Risk</p>
                    </div>
                  </div>
                  <Button className="w-full h-8 text-[9px] font-bold uppercase tracking-wider rounded-md" onClick={() => router.push(`/hr/applications/${topCandidate.applicationId}`)}>
                    View Profile <ChevronRight className="w-3 h-3 ml-1" />
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-border/40 shadow-sm rounded-2xl overflow-hidden flex items-center justify-center min-h-[300px]">
                <p className="text-xs text-muted-foreground">No candidate data available</p>
              </Card>
            )}

          </div>
        </div>

        {/* ROW 3: Evaluation Summary & Pending */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 pb-8">

          {/* Evaluation Summary */}
          <Card className="lg:col-span-8 border-border/40 shadow-sm rounded-2xl overflow-hidden">
            <CardHeader className="border-b border-border/40 px-4 py-2.5 bg-muted/20">
              <CardTitle className="text-[11px] font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-primary" /> Evaluation Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

                {/* Score Distribution */}
                <div className="space-y-4">
                  <h4 className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Status Distribution</h4>
                  <div className="relative h-32 w-full flex items-center justify-center">
                    <ResponsiveContainer minWidth={1} minHeight={1} width="100%" height="100%">
                      <PieChart>
                        <Pie data={distributionData} innerRadius={35} outerRadius={50} paddingAngle={2} dataKey="value">
                          {distributionData.map((entry: { name: string; value: number; color: string }, index: number) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ fontSize: '10px', padding: '4px 8px' }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-sm font-bold text-foreground">{kpiData?.totalCandidates || 0}</span>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    {distributionData.slice(0, 4).map((d: { name: string; value: number; color: string }, i: number) => (
                      <div key={i} className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-sm" style={{ backgroundColor: d.color }}></div>
                          <span className="text-[9px] font-medium text-muted-foreground uppercase truncate max-w-[80px]">{d.name}</span>
                        </div>
                        <span className="text-[9px] font-bold text-foreground">{d.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Job Role Performance */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Efficiency Metrics</h4>
                  </div>
                  <div className="space-y-4">
                    {[
                      { role: 'SLA Efficiency', score: opsCore?.slaEfficiency || 0 },
                      { role: 'Internal Reviews', score: Math.min(100, (opsCore?.internalDiscussions || 0) * 5) },
                      { role: 'Interview Turnaround', score: 72 },
                      { role: 'Offer Accuracy', score: 98 },
                    ].map((item, i) => (
                      <div key={i} className="space-y-1.5">
                        <div className="flex justify-between text-[9px] font-medium uppercase">
                          <span className="text-muted-foreground">{item.role}</span>
                          <span className="font-bold text-foreground">{item.score}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-primary" style={{ width: `${item.score}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Hiring Trend */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Hiring Trend</h4>
                  </div>
                  <div className="h-32 w-full">
                    <ResponsiveContainer minWidth={1} minHeight={1} width="100%" height="100%">
                      <LineChart data={sparkData.map((d, i) => ({ ...d, x: i }))}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#dde9ff" />
                        <XAxis dataKey="x" hide />
                        <YAxis hide />
                        <Tooltip contentStyle={{ fontSize: '10px', padding: '6px 10px', background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(16px)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.4)' }} />
                        <Line type="monotone" dataKey="v" stroke="#003b9a" strokeWidth={2} dot={{ r: 3, fill: '#003b9a' }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex justify-center gap-4 pt-2">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-0.5 rounded-full" style={{ backgroundColor: "#003b9a" }}></div>
                      <span className="text-[8px] font-bold uppercase text-muted-foreground tracking-wider">Hired</span>
                    </div>
                  </div>
                </div>

              </div>
            </CardContent>
          </Card>

          {/* Pending Actions */}
          <Card className="lg:col-span-4 border-border/40 shadow-sm rounded-2xl overflow-hidden h-fit">
            <CardHeader className="border-b border-border/40 px-4 py-2.5 flex flex-row items-center justify-between bg-muted/20">
              <CardTitle className="text-[11px] font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-rose-500" /> Action Items
              </CardTitle>
              <Button variant="link" onClick={() => router.push('/hr/pipeline')} className="text-[9px] font-bold uppercase p-0 h-fit text-muted-foreground hover:text-primary">View All</Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border/40">
                {pendingRaw && pendingRaw.length > 0 ? pendingRaw.slice(0, 5).map((item: { _id: string; candidateName: string; action: string; urgency: string }, i: number) => (
                  <div key={i} className="px-4 py-3 flex items-center justify-between hover:bg-muted/20 transition-colors cursor-pointer group" onClick={() => router.push(`/hr/applications/${item._id}`)}>
                    <div className="flex items-center gap-3">
                      <div className={cn("p-1.5 rounded-md border border-border/60 bg-white shadow-sm")}>
                        <FileText className={cn("w-3.5 h-3.5 text-primary")} />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-foreground uppercase tracking-tight leading-none mb-1">{item.candidateName}</p>
                        <div className="flex items-center gap-2">
                          <p className="text-[9px] font-medium text-muted-foreground">{item.action}</p>
                          <Badge className={cn("text-[8px] font-bold border-none px-1 py-0", item.urgency === 'CRITICAL' ? 'bg-rose-500/10 text-rose-500' : 'bg-amber-500/10 text-amber-500')}>{item.urgency}</Badge>
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-primary transition-colors" />
                  </div>
                )) : (
                  <div className="p-6 text-center text-[10px] font-bold text-muted-foreground uppercase opacity-60">No pending actions</div>
                )}
              </div>
            </CardContent>
          </Card>

        </div>

        {/* ROW 4: MD Decisions & Recent Hires */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pb-8">
          <Card className="border-border/40 shadow-sm rounded-2xl overflow-hidden">
            <CardHeader className="border-b border-border/40 px-4 py-2.5 flex flex-row items-center justify-between bg-muted/20">
              <CardTitle className="text-[11px] font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-purple-500" /> MD Decisions
                <Badge variant="secondary" className="font-bold text-[8px] px-1 py-0 bg-white border border-border/50">{(mdDecisionsRaw || []).length}</Badge>
              </CardTitle>
              <Button variant="link" onClick={() => router.push('/hr/md-decisions')} className="text-[9px] font-bold uppercase p-0 h-fit text-muted-foreground hover:text-primary">View All</Button>
            </CardHeader>
            <CardContent className="p-0">
              {mdDecisionsRaw && mdDecisionsRaw.length > 0 ? (
                <div className="divide-y divide-border/40">
                  {mdDecisionsRaw.slice(0, 8).map((d: any, i: number) => (
                    <div key={i} className="px-4 py-3 flex items-center justify-between hover:bg-muted/20 transition-colors cursor-pointer group"
                      onClick={() => router.push(`/hr/applications/${d.applicationId}`)}>
                      <div className="flex items-center gap-3">
                        <div className={cn("p-1.5 rounded-md border border-border/60 shadow-sm",
                          d.decision === 'RECOMMENDED' ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'
                        )}>
                          {d.decision === 'RECOMMENDED'
                            ? <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                            : <AlertCircle className="w-3.5 h-3.5 text-rose-600" />}
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-foreground uppercase tracking-tight leading-none mb-1">{d.candidateName}</p>
                          <div className="flex items-center gap-2">
                            <p className="text-[9px] font-medium text-muted-foreground">{d.jobTitle}{d.department ? ` • ${d.department}` : ''}</p>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={cn("text-[8px] font-bold border-none px-1.5 py-0",
                          d.decision === 'RECOMMENDED' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-rose-500/10 text-rose-600'
                        )}>
                          {d.decision === 'RECOMMENDED' ? 'MD RECOMMENDED' : 'MD REJECTED'}
                        </Badge>
                        {d.mdName && <span className="text-[8px] font-medium text-muted-foreground">{d.mdName}</span>}
                        <span className="text-[8px] font-medium text-muted-foreground tabular-nums">
                          {d.decidedAt ? new Date(d.decidedAt).toLocaleDateString() : ''}
                        </span>
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-primary transition-colors" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center">
                  <Shield className="w-6 h-6 text-muted-foreground/20 mx-auto mb-2" />
                  <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest">No MD decisions yet</p>
                  <p className="text-[9px] text-muted-foreground/40 mt-1">Decisions will appear here once MD reviews candidates</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/40 shadow-sm rounded-2xl overflow-hidden">
            <CardHeader className="border-b border-border/40 px-4 py-2.5 flex flex-row items-center justify-between bg-muted/20">
              <CardTitle className="text-[11px] font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                <Trophy className="w-3.5 h-3.5 text-primary" /> Recently Hired Candidates
                <Badge variant="secondary" className="font-bold text-[8px] px-1 py-0 bg-white border border-border/50">{(recentHiresRaw || []).length}</Badge>
              </CardTitle>
              <Button variant="link" onClick={() => router.push('/hr/pipeline')} className="text-[9px] font-bold uppercase p-0 h-fit text-muted-foreground hover:text-primary">View All</Button>
            </CardHeader>
            <CardContent className="p-0">
              {recentHiresRaw && recentHiresRaw.length > 0 ? (
                <div className="divide-y divide-border/40">
                  {recentHiresRaw.slice(0, 8).map((d: any, i: number) => (
                    <div key={i} className="px-4 py-3 flex items-center justify-between hover:bg-muted/20 transition-colors cursor-pointer group"
                      onClick={() => router.push(`/hr/applications/${d.id}`)}>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-muted border border-border/50 overflow-hidden shrink-0">
                           <img 
                             src={d.profileImage || "/images/default-avatar.png"} 
                             alt={d.name} 
                             className="w-full h-full object-cover"
                             onError={(e: any) => { e.target.src = "/images/default-avatar.png"; }}
                           />
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-foreground uppercase tracking-tight leading-none mb-1">{d.name}</p>
                          <div className="flex items-center gap-2">
                            <p className="text-[9px] font-medium text-muted-foreground">{d.jobTitle}{d.department ? ` • ${d.department}` : ''}</p>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className="bg-primary/10 text-primary border-none text-[8px] font-bold px-1.5 py-0 uppercase">
                          Hired
                        </Badge>
                        <span className="text-[8px] font-medium text-muted-foreground tabular-nums">
                          {d.hiredAt ? new Date(d.hiredAt).toLocaleDateString() : ''}
                        </span>
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-primary transition-colors" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center">
                  <Trophy className="w-6 h-6 text-muted-foreground/20 mx-auto mb-2" />
                  <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest">No Recent Hires</p>
                  <p className="text-[9px] text-muted-foreground/40 mt-1">Candidates who accept offers will appear here perfectly in real-time</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

      </div>
    </PanelLayout>
  );
}
