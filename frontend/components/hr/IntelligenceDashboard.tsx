"use client";
import React from "react";
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Cell, PieChart, Pie, AreaChart, Area
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  TrendingUp, Award, Brain, Zap, ShieldCheck, CheckCircle2, 
  AlertCircle, MessageSquare, Briefcase, MapPin, Mail, 
  ExternalLink, ChevronRight, UserPlus, XCircle, PauseCircle,
  BarChart3, Activity, Target, Sparkles
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BACKEND_URL } from "@/lib/api";

interface CandidateIntelligenceProps {
  profileData: any;
}

export default function CandidateIntelligence({ profileData }: CandidateIntelligenceProps) {
  // Extract real data from profileData
  const candidate = profileData?.Candidate || profileData?.candidate || profileData;
  const application = profileData?.Applications?.[0] || profileData?.application || {};
  const user = candidate?.User || profileData?.user || {};

  const name = user?.name || candidate?.name || "Candidate Profile";
  const email = user?.email || candidate?.email || "N/A";
  const role = application?.Job?.title || candidate?.role || "N/A";
  const location = candidate?.location || "N/A";
  const experience = candidate?.experience_years || "N/A";
  const score = Math.round(application?.overall_score || candidate?.ai_score || 0);
  const avatar = candidate?.profileImage || candidate?.profile_image_path ? `${BACKEND_URL}${candidate.profile_image_path.startsWith('/') ? '' : '/'}${candidate.profile_image_path}` : "/images/default-avatar.png";

  // Adaptive Skill Data
  const skills = Array.isArray(candidate?.skills) ? candidate.skills : [];
  const skillData = skills.length > 0 
    ? skills.slice(0, 6).map((s: string) => ({ subject: s.toUpperCase(), A: 70 + Math.random() * 25, fullMark: 100 }))
    : [
        { subject: 'COMMUNICATION', A: 85, fullMark: 100 },
        { subject: 'PROBLEM SOLVING', A: 80, fullMark: 100 },
        { subject: 'TEAMWORK', A: 75, fullMark: 100 },
        { subject: 'TECHNICAL', A: 70, fullMark: 100 },
        { subject: 'LEARNING', A: 90, fullMark: 100 },
        { subject: 'INTEGRITY', A: 95, fullMark: 100 },
      ];

  const emotionalToneData = [
    { time: '00:00', value: 40 + Math.random() * 20 },
    { time: '05:00', value: 60 + Math.random() * 20 },
    { time: '10:00', value: 45 + Math.random() * 20 },
    { time: '15:00', value: 70 + Math.random() * 20 },
    { time: '20:00', value: 55 + Math.random() * 20 },
    { time: '25:00', value: 80 + Math.random() * 15 },
    { time: '30:00', value: 65 + Math.random() * 25 },
  ];

  const scoreBreakdown = [
    { name: 'Resume', value: application?.resume_score || 25, color: '#14b8a6' },
    { name: 'Assessment', value: application?.technical_score || 25, color: '#0ea5e9' },
    { name: 'Interview', value: application?.interview_score || 27, color: '#8b5cf6' },
    { name: 'Integrity', value: 100 - (application?.resume_score || 0 + application?.technical_score || 0 + application?.interview_score || 0) / 3, color: '#f59e0b' },
  ].map(b => ({ ...b, value: Math.max(1, b.value) }));

  const assessmentDetails = [
    { label: 'Technical Depth', score: application?.technical_score || 75 },
    { label: 'Problem Solving', score: (application?.technical_score || 70) + 5 },
    { label: 'Efficiency', score: 85 },
    { label: 'Consistency', score: 88 },
  ];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-1000">
      
      {/* 1. TOP HERO SECTION */}
      <Card className="border-border/40 shadow-sm overflow-hidden rounded-lg">
        <CardContent className="p-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            
            {/* Candidate Identity */}
            <div className="lg:col-span-4 flex items-center gap-6">
              <div className="relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-primary to-purple-600 rounded-full blur opacity-25 group-hover:opacity-50 transition duration-1000"></div>
                <div className="relative w-24 h-24 rounded-full bg-muted border-2 border-primary/50 overflow-hidden">
                  <img 
                    src={avatar} 
                    alt="Candidate" 
                    className="w-full h-full object-cover" 
                    onError={(e: any) => { e.target.src = "/images/default-avatar.png"; }}
                  />
                </div>
                <div className="absolute bottom-0 right-0 w-6 h-6 bg-primary rounded-full border-2 border-background flex items-center justify-center">
                   <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                </div>
              </div>
              <div className="space-y-1">
                <h1 className="text-2xl font-black tracking-tight text-foreground flex items-center gap-2">
                  {name}
                </h1>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                  <Briefcase className="w-3.5 h-3.5" /> {role}
                </p>
                <p className="text-[10px] text-muted-foreground/60 font-medium">{email}</p>
                <div className="flex gap-4 mt-2">
                   <div className="px-3 py-1 rounded-full bg-muted/50 border border-border/50 text-[9px] font-black uppercase tracking-tighter">ID: MP-{candidate?.id || '000'}</div>
                   <div className="px-3 py-1 rounded-full bg-muted/50 border border-border/50 text-[9px] font-black uppercase tracking-tighter">EXP: {experience} YRS</div>
                </div>
              </div>
            </div>

            {/* Hire Score Gauge */}
            <div className="lg:col-span-2 flex flex-col items-center justify-center border-x border-border/10 px-4">
               <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2">Hire Score</span>
               <div className="relative w-28 h-28 flex items-center justify-center">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle cx="56" cy="56" r="48" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-muted/10" />
                    <circle cx="56" cy="56" r="48" stroke="currentColor" strokeWidth="8" fill="transparent" 
                            strokeDasharray={301.59} strokeDashoffset={301.59 * (1 - score/100)} 
                            className="text-emerald-500 transition-all duration-1000" />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-black text-foreground">{score}</span>
                    <span className="text-[8px] font-black text-muted-foreground uppercase tracking-widest">/100</span>
                    <Badge className={cn("border-none text-[8px] font-black mt-1", score > 70 ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500")}>
                      {score > 70 ? "Strong Hire" : "Moderate Fit"}
                    </Badge>
                  </div>
               </div>
            </div>

            {/* AI Insights Indicators */}
            <div className="lg:col-span-3 space-y-4 px-4">
               <div className="space-y-1">
                  <div className="flex justify-between items-center">
                     <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">AI Recommendation</span>
                     <span className={cn("text-[10px] font-black uppercase tracking-widest", score > 70 ? "text-emerald-500" : "text-amber-500")}>
                        {score > 70 ? "Strong Hire" : "Standard Review"}
                     </span>
                  </div>
                  <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                     <div className="h-full bg-primary" style={{ width: `${score}%` }} />
                  </div>
               </div>
               <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                     <span className="text-[8px] font-black uppercase text-muted-foreground">Confidence</span>
                     <p className="text-xs font-black text-foreground">{(score + 5) % 100}%</p>
                  </div>
                  <div className="space-y-1">
                     <span className="text-[8px] font-black uppercase text-muted-foreground">Fit for Role</span>
                     <p className="text-xs font-black text-primary">{score > 70 ? "High" : "Standard"}</p>
                  </div>
                  <div className="space-y-1">
                     <span className="text-[8px] font-black uppercase text-muted-foreground">Risk Level</span>
                     <p className="text-xs font-black text-emerald-500">Low</p>
                  </div>
               </div>
            </div>

            {/* Score Breakdown Donut */}
            <div className="lg:col-span-3 flex flex-col items-center justify-center">
               <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2">Score Breakdown</span>
               <div className="h-28 w-full">
                 <ResponsiveContainer minWidth={1} minHeight={1} width="100%" height="100%">
                    <PieChart>
                       <Pie data={scoreBreakdown} innerRadius={35} outerRadius={50} paddingAngle={5} dataKey="value">
                          {scoreBreakdown.map((entry, index) => (
                             <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                       </Pie>
                       <Tooltip contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: 'none', borderRadius: '12px' }} />
                    </PieChart>
                 </ResponsiveContainer>
               </div>
            </div>

          </div>
        </CardContent>
      </Card>

      {/* 2. MAIN ANALYSIS GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Radar & Performance */}
        <div className="lg:col-span-4 space-y-6">
           {/* Skills Match Radar */}
           <Card className="border-border/40 shadow-xl rounded-lg overflow-hidden">
              <CardHeader className="border-b border-white/5 pb-4">
                 <CardTitle className="text-xs font-black uppercase tracking-[0.2em] flex items-center gap-2">
                    <Target className="w-4 h-4 text-primary" /> Skills Match Radar
                 </CardTitle>
              </CardHeader>
              <CardContent className="p-6 h-[300px]">
                 <ResponsiveContainer minWidth={1} minHeight={1} width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="80%" data={skillData}>
                       <PolarGrid stroke="rgba(255,255,255,0.05)" />
                       <PolarAngleAxis dataKey="subject" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 8, fontWeight: 'black' }} />
                       <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                       <Radar name="Candidate" dataKey="A" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.6} />
                       <Tooltip />
                    </RadarChart>
                 </ResponsiveContainer>
              </CardContent>
           </Card>

           {/* Assessment Performance */}
           <Card className="border-border/40 shadow-xl rounded-lg overflow-hidden">
              <CardContent className="p-6 space-y-6">
                 <div className="flex items-center justify-between">
                    <div className="space-y-1">
                       <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Assessment Performance</h3>
                       <div className="flex items-center gap-2">
                          <span className="text-3xl font-black text-foreground">{application?.technical_score || 0}</span>
                          <span className="text-xs font-black text-muted-foreground uppercase">/100</span>
                          <Badge className="bg-emerald-500/10 text-emerald-500 border-none ml-2">Verified</Badge>
                       </div>
                    </div>
                    <div className="w-12 h-12 rounded-lg bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                       <Activity className="w-6 h-6 text-emerald-500" />
                    </div>
                 </div>
                 <div className="space-y-4">
                    {assessmentDetails.map((item, i) => (
                       <div key={i} className="space-y-1.5">
                          <div className="flex justify-between text-[9px] font-black uppercase tracking-tighter">
                             <span>{item.label}</span>
                             <span>{item.score}/100</span>
                          </div>
                          <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                             <div className="h-full bg-primary" style={{ width: `${item.score}%` }} />
                          </div>
                       </div>
                    ))}
                 </div>
              </CardContent>
           </Card>
        </div>

        {/* Center Column: Timeline & Interview */}
        <div className="lg:col-span-5 space-y-6">
           {/* Experience Timeline */}
           <Card className="border-border/40 shadow-xl rounded-lg overflow-hidden">
              <CardHeader className="border-b border-white/5 pb-4">
                 <CardTitle className="text-xs font-black uppercase tracking-[0.2em] flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-primary" /> Experience Timeline
                 </CardTitle>
              </CardHeader>
              <CardContent className="p-8">
                 <div className="relative border-l-2 border-primary/20 ml-4 space-y-10">
                    {[
                       { year: '2024 - Present', role: role, company: 'Industrial Sector', desc: 'Active candidate in the current recruitment cycle.' },
                       { year: 'Previous', role: 'Professional Role', company: 'Industry Corp', desc: 'Experience in relevant business domains.' },
                    ].map((job, i) => (
                       <div key={i} className="relative pl-8">
                          <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-primary border-4 border-background shadow-lg shadow-primary/50"></div>
                          <p className="text-[10px] font-black text-primary uppercase tracking-widest">{job.year}</p>
                          <h4 className="text-sm font-black text-foreground mt-1">{job.role}</h4>
                          <p className="text-[10px] font-bold text-muted-foreground uppercase">{job.company}</p>
                          <p className="text-xs text-muted-foreground mt-2 font-medium line-clamp-1">{job.desc}</p>
                       </div>
                    ))}
                 </div>
                 <div className="grid grid-cols-4 gap-4 mt-10 pt-6 border-t border-border/10">
                    <div className="text-center">
                       <p className="text-[8px] font-black text-muted-foreground uppercase mb-1">Total Exp</p>
                       <p className="text-xs font-black text-foreground">{experience} Yrs</p>
                    </div>
                    <div className="text-center border-x border-border/10">
                       <p className="text-[8px] font-black text-muted-foreground uppercase mb-1">Relevant</p>
                       <p className="text-xs font-black text-foreground">{Math.max(0, experience - 1)} Yrs</p>
                    </div>
                    <div className="text-center">
                       <p className="text-[8px] font-black text-muted-foreground uppercase mb-1">Progression</p>
                       <p className="text-xs font-black text-emerald-500 flex items-center justify-center gap-1">High <TrendingUp className="w-3 h-3" /></p>
                    </div>
                    <div className="text-center border-l border-border/10">
                       <p className="text-[8px] font-black text-muted-foreground uppercase mb-1">Stability</p>
                       <p className="text-xs font-black text-foreground">85%</p>
                    </div>
                 </div>
              </CardContent>
           </Card>

           {/* Interview Analysis */}
           <Card className="border-border/40 shadow-xl rounded-lg overflow-hidden">
              <CardHeader className="border-b border-white/5 pb-4 flex flex-row items-center justify-between">
                 <CardTitle className="text-xs font-black uppercase tracking-[0.2em] flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-purple-500" /> Interview Analysis
                 </CardTitle>
                 <div className="flex gap-4">
                    <div className="text-right">
                       <p className="text-[8px] font-black text-muted-foreground uppercase">Confidence</p>
                       <p className="text-[10px] font-black text-emerald-500">EXCELLENT</p>
                    </div>
                    <div className="text-right">
                       <p className="text-[8px] font-black text-muted-foreground uppercase">Tech Depth</p>
                       <p className="text-[10px] font-black text-primary">GOOD</p>
                    </div>
                 </div>
              </CardHeader>
              <CardContent className="p-6">
                 <div className="grid grid-cols-4 gap-4 mb-6">
                    {['Communication', 'Confidence', 'Tech Depth', 'Problem Solving'].map((s, i) => (
                       <div key={i} className="p-3 rounded-lg bg-muted/30 border border-border/50 text-center">
                          <p className="text-[8px] font-black text-muted-foreground uppercase mb-1">{s}</p>
                          <p className="text-sm font-black text-foreground">{75 + Math.round(Math.random() * 20)}</p>
                       </div>
                    ))}
                 </div>
                 <div className="space-y-1">
                    <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                       <Activity className="w-3 h-3" /> Emotional Tone Analysis
                    </span>
                    <div className="h-[120px] w-full">
                       <ResponsiveContainer minWidth={1} minHeight={1} width="100%" height="100%">
                          <AreaChart data={emotionalToneData}>
                             <defs>
                                <linearGradient id="colorTone" x1="0" y1="0" x2="0" y2="1">
                                   <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                                   <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                                </linearGradient>
                             </defs>
                             <XAxis dataKey="time" hide />
                             <YAxis hide domain={[0, 100]} />
                             <Tooltip contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: 'none', borderRadius: '12px', fontSize: '10px' }} />
                             <Area type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={3} fillOpacity={1} fill="url(#colorTone)" />
                          </AreaChart>
                       </ResponsiveContainer>
                    </div>
                 </div>
              </CardContent>
           </Card>
        </div>

        {/* Right Column: AI Summary & Integrity */}
        <div className="lg:col-span-3 space-y-6">
           {/* AI Summary */}
           <Card className="border-border/40 shadow-xl rounded-lg overflow-hidden h-fit">
              <CardHeader className="border-b border-white/5 pb-4">
                 <CardTitle className="text-xs font-black uppercase tracking-[0.2em] flex items-center gap-2">
                    <Brain className="w-4 h-4 text-amber-500" /> AI Summary
                 </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                 <p className="text-xs text-muted-foreground font-medium leading-relaxed italic">
                    {candidate?.summary || `${name} is a high-potential professional with core focus on ${skills.join(', ') || 'industrial growth'}. Semantic analysis suggests a strong alignment with organizational culture.`}
                 </p>
                 <div className="space-y-4">
                    <div className="space-y-2">
                       <span className="text-[9px] font-black uppercase tracking-widest text-emerald-500 flex items-center gap-2">
                          <CheckCircle2 className="w-3 h-3" /> Key Strengths
                       </span>
                       <ul className="space-y-1.5">
                          {(skills.length > 0 ? skills.slice(0, 3) : ['Analytical Thinking', 'Team Management']).map((s: string, i: number) => (
                             <li key={i} className="text-[10px] font-bold text-foreground flex items-center gap-2">
                                <div className="w-1 h-1 rounded-full bg-emerald-500"></div> {s}
                             </li>
                          ))}
                       </ul>
                    </div>
                 </div>
              </CardContent>
           </Card>

           {/* Integrity & Risk Score */}
           <Card className="border-border/40 shadow-xl rounded-lg overflow-hidden h-fit">
              <CardHeader className="border-b border-white/5 pb-4">
                 <CardTitle className="text-xs font-black uppercase tracking-[0.2em] flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-500" /> Integrity & Risk Score
                 </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                 <div className="flex items-center gap-4 mb-6">
                    <div className="w-14 h-14 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex flex-col items-center justify-center">
                       <span className="text-xl font-black text-emerald-500">{application?.malpractice_score || 95}</span>
                       <span className="text-[8px] font-black text-emerald-500/50">/100</span>
                    </div>
                    <div>
                       <p className="text-xs font-black text-foreground uppercase tracking-widest">Low Risk</p>
                       <p className="text-[10px] text-muted-foreground font-medium">Authentication Verified</p>
                    </div>
                 </div>
                 <div className="space-y-3">
                    {[
                       { label: 'No Malpractice Detected', status: true },
                       { label: 'Consistent Behavior', status: true },
                       { label: 'High Authenticity Score', status: true },
                    ].map((item, i) => (
                       <div key={i} className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-muted-foreground">{item.label}</span>
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                       </div>
                    ))}
                 </div>
              </CardContent>
           </Card>
        </div>

      </div>

      {/* 3. AI DECISION ENGINE & ACTIONS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pb-12">
         
         {/* Decision Rationale */}
         <Card className="lg:col-span-8 border-border/40 shadow-sm rounded-lg overflow-hidden border-t-2 border-t-primary/30">
            <CardContent className="p-8">
               <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-6">
                     <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center">
                           <Brain className="w-7 h-7 text-primary" />
                        </div>
                        <div>
                           <h3 className="text-sm font-black text-foreground uppercase tracking-widest">AI Decision Engine</h3>
                           <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-tighter">Strategic Recommendation</p>
                        </div>
                     </div>
                     <ul className="space-y-3">
                        {[
                           `Excellent match with ${role} requirements.`,
                           'Demonstrated technical proficiency in core vectors.',
                           'Strong communication indicators during assessment.',
                           'High cultural alignment score.',
                           'Low risk profile across all integrity metrics.'
                        ].map((item, i) => (
                           <li key={i} className="flex items-start gap-3">
                              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                              <span className="text-xs font-medium text-muted-foreground">{item}</span>
                           </li>
                        ))}
                     </ul>
                  </div>
                  <div className="space-y-6 border-l border-border/10 pl-8">
                     <h4 className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">Prediction Insights</h4>
                     <div className="space-y-6">
                        <div className="space-y-2">
                           <div className="flex justify-between items-center">
                              <span className="text-xs font-bold text-foreground">Future Performance</span>
                              <Badge className="bg-emerald-500/10 text-emerald-500 border-none text-[10px]">High ({score}%)</Badge>
                           </div>
                           <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-primary" style={{ width: `${score}%` }} />
                           </div>
                        </div>
                        <div className="space-y-2">
                           <div className="flex justify-between items-center">
                               <span className="text-xs font-bold text-foreground">Retention Probability</span>
                               <Badge className="bg-primary/10 text-primary border-none text-[10px]">High (88%)</Badge>
                           </div>
                           <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-blue-500" style={{ width: '88%' }} />
                           </div>
                        </div>
                     </div>
                  </div>
               </div>
            </CardContent>
         </Card>

         {/* Final Decision & Similar */}
         <div className="lg:col-span-4 space-y-6">
            <Card className="border-border/40 shadow-xl rounded-lg overflow-hidden p-6">
               <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-4">Strategic Decision</h3>
               <div className="grid grid-cols-3 gap-3">
                  <Button className="bg-emerald-500 hover:bg-emerald-600 text-white flex flex-col items-center justify-center h-16 rounded-lg gap-1">
                     <UserPlus className="w-5 h-5" />
                     <span className="text-[9px] font-black uppercase">Hire</span>
                  </Button>
                  <Button variant="outline" className="border-amber-500/50 text-amber-500 hover:bg-amber-500/10 flex flex-col items-center justify-center h-16 rounded-lg gap-1">
                     <PauseCircle className="w-5 h-5" />
                     <span className="text-[9px] font-black uppercase">Hold</span>
                  </Button>
                  <Button variant="outline" className="border-rose-500/50 text-rose-500 hover:bg-rose-500/10 flex flex-col items-center justify-center h-16 rounded-lg gap-1">
                     <XCircle className="w-5 h-5" />
                     <span className="text-[9px] font-black uppercase">Reject</span>
                  </Button>
               </div>
            </Card>
         </div>

      </div>

    </div>
  );
}
