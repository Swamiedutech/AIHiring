"use client";
import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PanelLayout from "@/components/shared/PanelLayout";
import { hrApi } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import {
  Mail, Send, FileText, Clock,
  Search, Plus, Eye, Copy, Trash2, Zap,
  DollarSign, CheckCircle2, AlertCircle, Calendar, Briefcase, User, Users, Bell, X, MoreVertical
} from "lucide-react";

// Pre-defined static communication templates mixed with dynamic offer templates
const STATIC_COMMS = [
  { id: "c1", name: "Interview Invitation", category: "Interviews", subject: "Interview Invitation — {role} at AI Hiring System", body: `Dear {candidateName},\n\nThank you for applying for the {role} position at AI Hiring System Pvt. Ltd.\n\nWe are pleased to invite you for an interview on {date} at {time}.\n\nPlease confirm your availability by responding to this email.\n\nBest regards,\nAI Hiring System HR Team`, color: "text-blue-500", bg: "bg-blue-500/10", type: "COMM" },
  { id: "c2", name: "Rejection", category: "Rejections", subject: "Application Update — AI Hiring System", body: `Dear {candidateName},\n\nThank you for your interest in the {role} position at AI Hiring System.\n\nAfter careful consideration, we regret to inform you that we will not be proceeding with your application at this time.\n\nWe appreciate your time and wish you the best in your job search.\n\nKind regards,\nAI Hiring System HR Team`, color: "text-rose-500", bg: "bg-rose-500/10", type: "COMM" },
  { id: "c3", name: "Assessment Reminder", category: "Assessments", subject: "Reminder: Complete Your Assessment — AI Hiring System", body: `Dear {candidateName},\n\nThis is a reminder that your technical assessment for the {role} position is pending completion.\n\nDeadline: {deadline}\n\nPlease log in to complete your assessment at your earliest convenience.\n\nBest regards,\nAI Hiring System HR Team`, color: "text-amber-500", bg: "bg-amber-500/10", type: "COMM" },
  { id: "c4", name: "Shortlist Notification", category: "Pipeline", subject: "Great News! You've Been Shortlisted — AI Hiring System", body: `Dear {candidateName},\n\nWe are pleased to inform you that your application for the {role} position has been shortlisted.\n\nOur team will be in touch shortly with next steps.\n\nThank you for your patience.\n\nHR Team, AI Hiring System`, color: "text-purple-500", bg: "bg-purple-500/10", type: "COMM" },
  { id: "c5", name: "Onboarding Welcome", category: "Onboarding", subject: "Welcome to AI Hiring System! Your First Day Details", body: `Dear {candidateName},\n\nWelcome to AI Hiring System! We are thrilled to have you join our team.\n\nYour first day details:\n- Date: {startDate}\n- Reporting Time: 9:00 AM\n- Location: {officeAddress}\n- Report to: {reportingManager}\n\nPlease bring your original documents for verification.\n\nWarm regards,\nAI Hiring System HR Team`, color: "text-cyan-500", bg: "bg-cyan-500/10", type: "COMM" },
];

const CATEGORIES = ["All", "Offers", "Interviews", "Rejections", "Assessments", "Pipeline", "Onboarding"];

export default function OffersCommunicationsPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<"templates" | "dispatched">("templates");
  const [activeCategory, setActiveCategory] = useState("All");
  const [search, setSearch] = useState("");

  const [composeOpen, setComposeOpen] = useState(false);
  const [offerOpen, setOfferOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [previewTemplate, setPreviewTemplate] = useState<any>(null);

  const [commForm, setCommForm] = useState({ to: "", subject: "", body: "" });

  const [offerForm, setOfferForm] = useState({
    applicationId: "", salary: "", currency: "INR",
    startDate: "", expiryDate: "", notes: "", templateId: "",
  });

  const [templateForm, setTemplateForm] = useState({
    templateName: "", templateContent: ""
  });

  const { data: appsData = [] } = useQuery({
    queryKey: ["hr-applications-offers"],
    queryFn: async () => {
      const res = await hrApi.getApplications();
      return Array.isArray(res.data?.data) ? res.data.data : [];
    },
  });

  const { data: templatesData = [], refetch: refetchTemplates } = useQuery({
    queryKey: ["offer-templates"],
    queryFn: () => hrApi.getOfferTemplates().then(r => r.data.templates || []),
  });

  const { data: dispatchedOffers = [], isLoading: loadingOffers } = useQuery({
    queryKey: ["dispatched-offers"],
    queryFn: () => hrApi.getDispatchedOffers().then(r => r.data.data || []),
  });

  const createOfferMutation = useMutation({
    mutationFn: (data: object) => hrApi.createOffer(data),
    onSuccess: () => {
      setOfferOpen(false);
      setOfferForm({ applicationId: "", salary: "", currency: "INR", startDate: "", expiryDate: "", notes: "", templateId: "" });
      toast.success("Offer dispatched successfully!");
    },
    onError: () => toast.error("Failed to dispatch offer")
  });

  const createTemplateMutation = useMutation({
    mutationFn: (data: any) => hrApi.createOfferTemplate(data),
    onSuccess: () => {
      setTemplateOpen(false);
      refetchTemplates();
      toast.success("Template created successfully");
    }
  });

  const updateTemplateMutation = useMutation({
    mutationFn: ({ id, data }: any) => hrApi.updateOfferTemplate(id, data),
    onSuccess: () => {
      setTemplateOpen(false);
      refetchTemplates();
      toast.success("Template updated successfully");
    }
  });

  // Merge static comms and dynamic offer templates
  const allTemplates = useMemo(() => {
    const dynamicOffers = templatesData.map((t: any) => ({
      id: t.templateId, name: t.templateName, category: "Offers",
      subject: "Offer of Employment — AI Hiring System",
      body: t.templateContent, color: "text-emerald-500", bg: "bg-emerald-500/10", type: "OFFER", raw: t
    }));
    return [...dynamicOffers, ...STATIC_COMMS];
  }, [templatesData]);

  const filteredTemplates = allTemplates.filter(t => {
    const matchCat = activeCategory === "All" || t.category === activeCategory;
    const matchSearch = !search || t.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const handleOfferSubmit = () => {
    createOfferMutation.mutate({
      application_id: offerForm.applicationId,
      salary: Number(offerForm.salary),
      currency: offerForm.currency,
      joining_date: offerForm.startDate,
      expires_at: offerForm.expiryDate,
      benefits: offerForm.notes,
      templateId: offerForm.templateId || undefined,
    });
  };

  const handleTemplateSubmit = () => {
    if (editingTemplate) {
      updateTemplateMutation.mutate({ id: editingTemplate.id, data: templateForm });
    } else {
      createTemplateMutation.mutate(templateForm);
    }
  };

  const handleCommSubmit = () => {
    toast.success("Message sent successfully!");
    setComposeOpen(false);
    setCommForm({ to: "", subject: "", body: "" });
  };

  const openEditTemplate = (tmpl: any) => {
    if (tmpl.type !== "OFFER") {
      toast.error("Static communication templates cannot be edited here.");
      return;
    }
    setEditingTemplate(tmpl);
    setTemplateForm({ templateName: tmpl.name, templateContent: tmpl.body });
    setTemplateOpen(true);
  };

  return (
    <PanelLayout title="Offer & Communication Center" allowedRoles={["HR", "ADMIN"]}>
      <div className="max-w-[1600px] mx-auto space-y-8 p-4 md:p-8 animate-in fade-in slide-in-from-bottom-4 duration-700">

        {/* HEADER */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 border-b border-border/10 pb-6">
          <div className="space-y-1">
            <h1 className="text-2xl font-black text-foreground tracking-tight uppercase flex items-center gap-2">
              <Mail className="w-6 h-6 text-primary" /> Offer & Communication Center
            </h1>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
              Draft, dispatch and track offers and candidate communications
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex bg-muted/20 p-1 rounded-xl mr-4 border border-border/30">
              <button onClick={() => setActiveTab("templates")} className={cn("px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all", activeTab === "templates" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground")}>Templates</button>
              <button onClick={() => setActiveTab("dispatched")} className={cn("px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all", activeTab === "dispatched" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground")}>Dispatched</button>
            </div>
            {activeTab === "templates" && (
              <Button onClick={() => { setEditingTemplate(null); setTemplateForm({ templateName: "", templateContent: "" }); setTemplateOpen(true); }} className="industrial-gradient text-white h-10 rounded-xl text-xs font-black uppercase gap-2 px-6">
                <Plus className="w-4 h-4" /> Create Offer Template
              </Button>
            )}
          </div>
        </div>

        {activeTab === "templates" ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* LEFT SIDEBAR */}
            <div className="lg:col-span-3 space-y-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input value={search} onChange={e => setSearch(e.target.value)}
                  className="pl-10 h-11 w-full bg-muted/20 border-border/40 rounded-xl text-xs font-bold" placeholder="Search templates..." />
              </div>
              <Card className="border-border/40 shadow-xl rounded-lg overflow-hidden">
                <CardHeader className="border-b border-white/5 px-6 py-4">
                  <CardTitle className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">Categories</CardTitle>
                </CardHeader>
                <CardContent className="p-2">
                  {CATEGORIES.map(cat => (
                    <button key={cat} onClick={() => setActiveCategory(cat)}
                      className={cn("w-full px-4 py-3 rounded-xl text-left flex items-center justify-between transition-all",
                        activeCategory === cat ? "bg-primary/10 text-primary font-black" : "text-muted-foreground hover:bg-muted/10 font-bold")}>
                      <span className="text-[11px] uppercase tracking-widest">{cat}</span>
                      <Badge variant="secondary" className={cn("text-[9px] font-black", activeCategory === cat ? "bg-primary/20 text-primary" : "")}>
                        {cat === "All" ? allTemplates.length : allTemplates.filter(t => t.category === cat).length}
                      </Badge>
                    </button>
                  ))}
                </CardContent>
              </Card>

              <Card className="border-border/40 shadow-xl rounded-lg overflow-hidden">
                <CardHeader className="border-b border-white/5 px-6 py-4">
                  <CardTitle className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-500" /> Quick Dispatch
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-2">
                  <Button variant="ghost" onClick={() => setOfferOpen(true)} className="w-full justify-start gap-3 h-10 text-[10px] font-black uppercase tracking-widest text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10">
                    <DollarSign className="w-4 h-4" /> Initialize Formal Offer
                  </Button>
                  <Button variant="ghost" onClick={() => { setCommForm({ to: "", subject: "", body: "" }); setComposeOpen(true); }} className="w-full justify-start gap-3 h-10 text-[10px] font-black uppercase tracking-widest text-blue-500 hover:text-blue-400 hover:bg-blue-500/10">
                    <Mail className="w-4 h-4" /> Compose Custom Email
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* TEMPLATES GRID */}
            <div className="lg:col-span-9">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredTemplates.map((tmpl) => (
                  <Card key={tmpl.id} className="border-border/40 hover:shadow-sm hover:border-primary/30 transition-all duration-300 group rounded-lg overflow-hidden flex flex-col">
                    <CardContent className="p-6 flex-1 flex flex-col">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className={cn("p-2.5 rounded-xl border border-border/50", tmpl.bg, tmpl.color)}>
                            {tmpl.type === "OFFER" ? <FileText className="w-4 h-4" /> : <Mail className="w-4 h-4" />}
                          </div>
                          <div>
                            <h3 className="text-[12px] font-black text-foreground uppercase tracking-tight">{tmpl.name}</h3>
                            <Badge variant="outline" className={cn("text-[8px] font-black uppercase border-border/30 mt-1", tmpl.color)}>{tmpl.category}</Badge>
                          </div>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="w-7 h-7 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
                              <MoreVertical className="w-3.5 h-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent className="w-40 border-border/40" align="end">
                            <DropdownMenuItem className="text-[11px] font-bold gap-2 cursor-pointer" onClick={() => setPreviewTemplate(tmpl)}>
                              <Eye className="w-3.5 h-3.5" /> Preview
                            </DropdownMenuItem>
                            {tmpl.type === "OFFER" && (
                              <DropdownMenuItem className="text-[11px] font-bold gap-2 cursor-pointer" onClick={() => openEditTemplate(tmpl)}>
                                <FileText className="w-3.5 h-3.5" /> Edit Template
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem className="text-[11px] font-bold gap-2 cursor-pointer" onClick={() => { navigator.clipboard.writeText(tmpl.body); toast.success("Copied to clipboard"); }}>
                              <Copy className="w-3.5 h-3.5" /> Copy Content
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      <p className="text-[10px] font-bold text-muted-foreground truncate mb-4">{tmpl.subject}</p>
                      <p className="text-[10px] font-medium text-muted-foreground/70 line-clamp-3 leading-relaxed mb-4 flex-1">
                        {tmpl.body}
                      </p>
                      <div className="flex gap-2 mt-auto">
                        {tmpl.type === "OFFER" ? (
                          <Button size="sm" onClick={() => { setOfferForm(f => ({ ...f, templateId: tmpl.id })); setOfferOpen(true); }} className="flex-1 h-8 bg-emerald-500 hover:bg-emerald-600 text-white text-[9px] font-black uppercase tracking-widest gap-2">
                            <Send className="w-3 h-3" /> Draft Offer
                          </Button>
                        ) : (
                          <Button size="sm" onClick={() => { setCommForm({ to: "", subject: tmpl.subject, body: tmpl.body }); setComposeOpen(true); }} className="flex-1 h-8 industrial-gradient text-white text-[9px] font-black uppercase tracking-widest gap-2">
                            <Send className="w-3 h-3" /> Use Template
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => setPreviewTemplate(tmpl)} className="h-8 w-8 p-0 rounded-lg border-border/40"><Eye className="w-3.5 h-3.5" /></Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {filteredTemplates.length === 0 && (
                  <div className="col-span-2 text-center py-20 border-2 border-dashed border-border/20 rounded-lg">
                    <Mail className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                    <p className="text-xs font-black text-muted-foreground uppercase tracking-widest">No templates found in this category</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {loadingOffers ? (
              <div className="col-span-2 text-center py-20">
                <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-xs font-black text-muted-foreground uppercase tracking-widest">Loading Dispatched Offers...</p>
              </div>
            ) : dispatchedOffers.length === 0 ? (
              <div className="col-span-2 text-center py-32 border-border/40 rounded-lg">
                <Clock className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                <h3 className="text-lg font-black text-foreground uppercase tracking-widest">No Dispatched Items</h3>
                <p className="text-xs text-muted-foreground mt-2 font-medium uppercase tracking-widest">Log of sent offers and emails will appear here.</p>
              </div>
            ) : (
              dispatchedOffers.map((offer: any) => (
                <Card key={offer.id} className="border-border/40 hover:shadow-sm transition-all duration-300 rounded-lg overflow-hidden flex flex-col">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl border border-border/50 bg-emerald-500/10 text-emerald-500">
                          <CheckCircle2 className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 className="text-[12px] font-black text-foreground uppercase tracking-tight">
                            {offer.application?.Candidate?.User?.name || "Unknown Candidate"}
                          </h3>
                          <Badge variant="outline" className="text-[8px] font-black uppercase border-border/30 mt-1 text-emerald-500">
                            {offer.status || "DISPATCHED"}
                          </Badge>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold text-muted-foreground bg-muted/20 px-2 py-1 rounded-lg">
                        {new Date(offer.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="space-y-2 mt-4 text-[11px] font-medium text-muted-foreground">
                      <div className="flex justify-between p-2 bg-muted/20 rounded-lg">
                        <span>Role</span>
                        <span className="text-foreground font-bold">{offer.position_title || "Role"}</span>
                      </div>
                      <div className="flex justify-between p-2 bg-muted/20 rounded-lg">
                        <span>CTC</span>
                        <span className="text-foreground font-bold">₹ {offer.salary?.toLocaleString() || "TBD"}</span>
                      </div>
                      <div className="flex justify-between p-2 bg-muted/20 rounded-lg">
                        <span>Joining Date</span>
                        <span className="text-foreground font-bold">{new Date(offer.joining_date).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}

        {/* DIALOGS */}

        {/* OFFER DIALOG */}
        <Dialog open={offerOpen} onOpenChange={setOfferOpen}>
          <DialogContent className="max-w-xl border-border/40 text-foreground p-0 overflow-hidden">
            <DialogHeader className="px-8 py-6 border-b border-white/5 bg-emerald-500/5">
              <DialogTitle className="flex items-center gap-3 text-lg font-black uppercase tracking-tight text-emerald-500">
                <DollarSign className="w-5 h-5" /> Initialize Employment Offer
              </DialogTitle>
              <DialogDescription className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mt-1">
                Formal Document Dispatch
              </DialogDescription>
            </DialogHeader>
            <div className="p-8 space-y-6">
              <div className="space-y-2">
                <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Target Candidate (Pipeline)</Label>
                <Select value={offerForm.applicationId} onValueChange={v => setOfferForm(f => ({ ...f, applicationId: v }))}>
                  <SelectTrigger className="h-11 rounded-xl bg-muted/20 border-border/40 font-bold"><SelectValue placeholder="Select cleared candidate..." /></SelectTrigger>
                  <SelectContent className="border-border/40 text-foreground">
                    {appsData.map((a: any) => (
                      <SelectItem key={a._id} value={a._id} className="text-xs py-3 font-bold">
                        {a.candidateId?.name || "Anonymous"} <span className="text-muted-foreground mx-1">/</span> {a.jobId?.title || "Role"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Offer Template</Label>
                <Select value={offerForm.templateId} onValueChange={v => setOfferForm(f => ({ ...f, templateId: v }))}>
                  <SelectTrigger className="h-11 rounded-xl bg-muted/20 border-border/40 font-bold"><SelectValue placeholder="Select offer format..." /></SelectTrigger>
                  <SelectContent className="border-border/40 text-foreground">
                    {templatesData.map((t: any) => (
                      <SelectItem key={t.templateId} value={t.templateId} className="text-xs font-bold">{t.templateName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Base CTC</Label>
                  <Input type="number" className="h-11 rounded-xl bg-muted/20 border-border/40 font-black text-emerald-500" value={offerForm.salary} onChange={e => setOfferForm(f => ({ ...f, salary: e.target.value }))} placeholder="0.00" />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Currency Unit</Label>
                  <Select value={offerForm.currency} onValueChange={v => setOfferForm(f => ({ ...f, currency: v }))}>
                    <SelectTrigger className="h-11 rounded-xl bg-muted/20 border-border/40 font-bold"><SelectValue /></SelectTrigger>
                    <SelectContent className="border-border/40 text-foreground">
                      <SelectItem value="INR" className="text-xs font-bold">INR (₹)</SelectItem>
                      <SelectItem value="USD" className="text-xs font-bold">USD ($)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Joining Date</Label>
                  <Input type="date" className="h-11 rounded-xl bg-muted/20 border-border/40 font-bold" value={offerForm.startDate} onChange={e => setOfferForm(f => ({ ...f, startDate: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Valid Until</Label>
                  <Input type="date" className="h-11 rounded-xl bg-muted/20 border-border/40 font-bold" value={offerForm.expiryDate} onChange={e => setOfferForm(f => ({ ...f, expiryDate: e.target.value }))} />
                </div>
              </div>
            </div>
            <DialogFooter className="px-8 py-5 border-t border-white/5 bg-muted/10 gap-3">
              <Button variant="ghost" onClick={() => setOfferOpen(false)} className="text-[10px] font-black uppercase tracking-widest">Cancel</Button>
              <Button onClick={handleOfferSubmit} disabled={!offerForm.applicationId || createOfferMutation.isPending} className="bg-emerald-500 hover:bg-emerald-600 text-white font-black uppercase tracking-widest text-[10px] h-11 px-8 gap-2">
                {createOfferMutation.isPending ? "Executing..." : "Dispatch Offer"} <Send className="w-3.5 h-3.5" />
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* TEMPLATE EDITOR DIALOG */}
        <Dialog open={templateOpen} onOpenChange={setTemplateOpen}>
          <DialogContent className="max-w-2xl border-border/40 text-foreground p-0 overflow-hidden">
            <DialogHeader className="px-8 py-6 border-b border-white/5">
              <DialogTitle className="flex items-center gap-3 text-lg font-black uppercase tracking-tight">
                <FileText className="w-5 h-5 text-primary" /> {editingTemplate ? "Refine Template" : "Construct Offer Template"}
              </DialogTitle>
            </DialogHeader>
            <div className="p-8 space-y-6">
              <div className="space-y-2">
                <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Template Identifier</Label>
                <Input className="h-11 rounded-xl bg-muted/20 border-border/40 font-bold" value={templateForm.templateName} onChange={e => setTemplateForm(f => ({ ...f, templateName: e.target.value }))} placeholder="e.g. Standard Full-Time Offer" />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-end mb-2">
                  <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Document Content</Label>
                  <span className="text-[9px] text-primary font-black uppercase tracking-widest">Uses {'{{candidateName}}'}</span>
                </div>
                <Textarea rows={12} className="rounded-xl bg-muted/20 border-border/40 resize-none text-xs p-6 leading-relaxed font-medium" value={templateForm.templateContent} onChange={e => setTemplateForm(f => ({ ...f, templateContent: e.target.value }))} placeholder="Start drafting..." />
              </div>
            </div>
            <DialogFooter className="px-8 py-5 border-t border-white/5 bg-muted/10 gap-3">
              <Button variant="ghost" onClick={() => setTemplateOpen(false)} className="text-[10px] font-black uppercase tracking-widest">Cancel</Button>
              <Button onClick={handleTemplateSubmit} disabled={!templateForm.templateName || !templateForm.templateContent || createTemplateMutation.isPending || updateTemplateMutation.isPending} className="industrial-gradient text-white font-black uppercase tracking-widest text-[10px] h-11 px-8 gap-2">
                {createTemplateMutation.isPending || updateTemplateMutation.isPending ? "Syncing..." : editingTemplate ? "Update Template" : "Create Template"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* EMAIL COMPOSE DIALOG */}
        <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
          <DialogContent className="max-w-2xl border-border/40 text-foreground p-0 overflow-hidden">
            <DialogHeader className="px-8 py-6 border-b border-white/5">
              <DialogTitle className="text-lg font-black uppercase tracking-tight flex items-center gap-2 text-blue-500">
                <Mail className="w-5 h-5" /> Compose Message
              </DialogTitle>
            </DialogHeader>
            <div className="p-8 space-y-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">To</Label>
                <Input value={commForm.to} onChange={e => setCommForm(f => ({ ...f, to: e.target.value }))} className="h-11 rounded-xl bg-muted/20 border-border/40 font-bold" placeholder="candidate@email.com" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Subject</Label>
                <Input value={commForm.subject} onChange={e => setCommForm(f => ({ ...f, subject: e.target.value }))} className="h-11 rounded-xl bg-muted/20 border-border/40 font-bold" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Message</Label>
                <Textarea rows={10} value={commForm.body} onChange={e => setCommForm(f => ({ ...f, body: e.target.value }))} className="rounded-xl bg-muted/20 border-border/40 text-xs p-4 leading-relaxed font-medium" />
              </div>
            </div>
            <DialogFooter className="px-8 py-5 border-t border-white/5 bg-muted/10 gap-3">
              <Button variant="ghost" onClick={() => setComposeOpen(false)} className="text-[10px] font-black uppercase tracking-widest">Cancel</Button>
              <Button onClick={handleCommSubmit} disabled={!commForm.to || !commForm.subject} className="bg-blue-500 hover:bg-blue-600 text-white font-black uppercase tracking-widest text-[10px] h-11 px-8 gap-2">
                Send Message <Send className="w-3.5 h-3.5" />
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* PREVIEW DIALOG */}
        <Dialog open={!!previewTemplate} onOpenChange={(o) => { if (!o) setPreviewTemplate(null); }}>
          <DialogContent className="max-w-2xl border-border/40 text-foreground p-0 overflow-hidden">
            <DialogHeader className="px-8 py-6 border-b border-white/5">
              <DialogTitle className="text-lg font-black uppercase tracking-tight">{previewTemplate?.name}</DialogTitle>
            </DialogHeader>
            <div className="p-8 space-y-4">
              <div className="p-4 bg-muted/20 rounded-xl border border-border/40">
                <div className="text-[10px] font-black uppercase text-muted-foreground tracking-widest mb-2">Subject / Type</div>
                <div className="text-sm font-bold text-foreground flex items-center">{previewTemplate?.subject} <Badge variant="outline" className="ml-2 text-[8px] font-black uppercase">{previewTemplate?.type}</Badge></div>
              </div>
              <div className="p-4 bg-muted/20 rounded-xl border border-border/40">
                <div className="text-[10px] font-black uppercase text-muted-foreground tracking-widest mb-2">Content</div>
                <pre className="text-[12px] font-medium text-foreground whitespace-pre-wrap leading-relaxed">{previewTemplate?.body}</pre>
              </div>
            </div>
            <DialogFooter className="px-8 py-5 border-t border-white/5 flex gap-3">
              <Button variant="outline" onClick={() => setPreviewTemplate(null)} className="border-border/40 text-xs font-black uppercase w-full">Close Preview</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </PanelLayout>
  );
}
