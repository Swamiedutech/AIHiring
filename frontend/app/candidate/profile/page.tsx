"use client";

import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { candidateApi } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Mail, Phone, MapPin, GraduationCap, Briefcase,
  Calendar, Save, Loader2, X, Sparkles, Search,
  FileText, Camera, CheckCircle2, Star, Plus, PenTool, ShieldCheck,
  Download, ExternalLink, RefreshCw
} from "lucide-react";
import { toast } from "sonner";
import { useUIStore } from "@/lib/store";

export default function CandidateProfilePage() {
  const qc = useQueryClient();
  const { setPageTitle } = useUIStore();
  const [skillsInput, setSkillsInput] = useState("");
  const skillInputRef = React.useRef<HTMLInputElement>(null);
  const educationInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPageTitle("My Profile");
  }, []);

  const { data: overview, isLoading } = useQuery({
    queryKey: ["candidate-overview"],
    queryFn: () => candidateApi.getDashboard().then(r => r.data),
    staleTime: 1000 * 60 * 5,
  });

  const [form, setForm] = useState({
    education: "",
    specialization: "",
    experience_years: 0,
    phone: "",
    location: "",
    skills: [] as string[],
    cgpa: 0,
    year_of_passout: 0,
    summary: "",
    candidate_type: "" as "" | "FRESHER" | "WORKING_PROFESSIONAL",
    domain: "",
    area_of_interest: "",
    current_company: "",
    working_address: "",
  });

  const resetFormFromData = () => {
    if (overview?.candidate) {
      const c = overview.candidate;
      setForm({
        education: c.education === "Not Provided" ? "" : c.education || "",
        specialization: c.specialization === "Not Provided" ? "" : c.specialization || "",
        experience_years: Number(c.experience_years) || 0,
        phone: c.phone || "",
        location: c.location || "",
        skills: c.skills || [],
        cgpa: Number(c.cgpa) || 0,
        year_of_passout: Number(c.year_of_passout) || 0,
        summary: c.summary || "",
        candidate_type: (c.candidate_type as "" | "FRESHER" | "WORKING_PROFESSIONAL") || "",
        domain: c.domain || "",
        area_of_interest: c.area_of_interest || "",
        current_company: c.current_company || "",
        working_address: c.working_address || "",
      });
    }
  };

  useEffect(() => {
    resetFormFromData();
  }, [overview?.candidate?.updated_at]);

  const updateMutation = useMutation({
    mutationFn: (data: typeof form) => candidateApi.updateProfile(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["candidate-overview"] });
      toast.success("Profile updated successfully");
    },
    onError: (err: any) => {
      console.error("Update error:", err);
      toast.error(err.response?.data?.message || "Failed to save changes. Please check all fields.");
    }
  });

  const uploadAvatarMutation = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append("profile_image", file);
      return candidateApi.uploadProfileImage(fd);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["candidate-overview"] });
      toast.success("Profile picture updated!");
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || "Failed to upload image");
    }
  });

  const applyAutofillData = (autofillData: any) => {
    if (!autofillData) return;
    setForm(f => ({
      ...f,
      education: autofillData.education || f.education,
      specialization: autofillData.specialization || f.specialization,
      experience_years: autofillData.experience_years ?? f.experience_years,
      phone: autofillData.phone || f.phone,
      location: autofillData.location || f.location,
      skills: autofillData.skills?.length ? autofillData.skills : f.skills,
      cgpa: autofillData.cgpa || f.cgpa,
      year_of_passout: autofillData.year_of_passout || f.year_of_passout,
      summary: autofillData.summary || f.summary,
      candidate_type: autofillData.candidate_type || f.candidate_type,
      domain: autofillData.domain || f.domain,
      area_of_interest: autofillData.area_of_interest || f.area_of_interest,
      current_company: autofillData.current_company || f.current_company,
      working_address: autofillData.working_address || f.working_address,
    }));
  };

  const uploadResumeMutation = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append("resume", file);
      return candidateApi.uploadResume(fd);
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["candidate-overview"] });
      const autofillData = res.data?.data?.autofillData;
      if (autofillData) {
        applyAutofillData(autofillData);
        toast.success("Resume parsed! Profile auto-filled. Please review and save.");
      } else {
        toast.success("Resume uploaded successfully.");
      }
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || "Failed to upload resume");
    }
  });

  const autofillMutation = useMutation({
    mutationFn: () => candidateApi.autofillFromResume(),
    onSuccess: (res) => {
      const autofillData = res.data?.autofillData;
      if (autofillData) {
        applyAutofillData(autofillData);
        toast.success("Profile auto-filled from resume! Please review and save.");
      } else {
        toast.info("No data extracted. Try re-uploading your resume.");
      }
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || "Failed to auto-fill from resume");
    }
  });

  if (isLoading) return <div className="flex items-center justify-center min-h-[400px]"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>;

  const candidate = overview?.candidate;
  const avatarSrc = candidate?.profile_image_path
    ? (candidate.profile_image_path.startsWith('http')
      ? candidate.profile_image_path
      : `http://localhost:5000${candidate.profile_image_path}`)
    : null;

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-12">
      {/* Profile Header */}
      <Card className="border-none shadow-sm rounded-[40px] bg-white p-6 overflow-hidden relative">
        <div className="flex flex-col lg:flex-row items-center gap-6">
          <div className="relative group">
            <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-slate-50 shadow-sm">
              <img
                src={avatarSrc || "/images/default-avatar.png"}
                alt="Profile"
                className="w-full h-full object-cover"
                onError={(e: any) => { e.target.src = "/images/default-avatar.png"; }}
              />
            </div>
            <label className="absolute bottom-1 right-1 p-2.5 rounded-full bg-white border border-slate-100 shadow-md hover:bg-slate-50 cursor-pointer transition-all">
              <Camera className="w-4 h-4 text-blue-600" />
              <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadAvatarMutation.mutate(file);
              }} />
            </label>
            {uploadAvatarMutation.isPending && (
              <div className="absolute inset-0 bg-white/60 rounded-full flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
              </div>
            )}
          </div>

          <div className="flex-1 text-center lg:text-left space-y-4">
            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-4">
              <h1 className="text-xl font-bold text-slate-900">{candidate?.name}</h1>
              <Badge className="bg-blue-50 text-blue-600 border-blue-100 px-3 py-1 gap-1.5 font-bold">
                <CheckCircle2 className="w-3 h-3" /> Verified
              </Badge>
            </div>
            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-6 text-slate-500 font-medium">
              <span className="flex items-center gap-2"><Mail className="w-4 h-4 text-slate-400" /> {candidate?.email}</span>
              {form.phone && <span className="flex items-center gap-2"><Phone className="w-4 h-4 text-slate-400" /> {form.phone}</span>}
              {form.location && <span className="flex items-center gap-2"><MapPin className="w-4 h-4 text-slate-400" /> {form.location}</span>}
            </div>
            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-2">
              {form.skills.map(s => <Badge key={s} variant="secondary" className="bg-slate-50 text-slate-600 border-none px-4 py-1.5">{s}</Badge>)}
              <Button variant="outline" size="sm" className="h-9 px-4 rounded-xl border-slate-100 text-blue-600 gap-2" onClick={() => skillInputRef.current?.focus()}><Plus className="w-3 h-3" /> Add</Button>
            </div>
          </div>

          <div className="flex flex-col items-end gap-4">
            <Button className="bg-blue-600 hover:bg-blue-700 h-12 px-6 rounded-xl shadow-lg shadow-blue-200 font-bold gap-2" onClick={() => updateMutation.mutate(form)} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Changes
            </Button>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Last updated: 26 Apr 2026</p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Academic Info */}
        <Card className="border-none shadow-sm rounded-xl bg-white overflow-hidden">
          <CardHeader className="p-5 pb-4">
            <CardTitle className="text-xl font-bold flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600"><GraduationCap className="w-6 h-6" /></div>
              Academic Details
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5 space-y-6">
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Highest Qualification</Label>
                <Input ref={educationInputRef} value={form.education} onChange={e => setForm(f => ({ ...f, education: e.target.value }))} className="h-12 bg-slate-50 border-none rounded-xl px-4 font-medium" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Specialization</Label>
                <Input value={form.specialization} onChange={e => setForm(f => ({ ...f, specialization: e.target.value }))} className="h-12 bg-slate-50 border-none rounded-xl px-4 font-medium" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-400 uppercase tracking-wider">CGPA / Percentage</Label>
                <Input type="number" step="0.01" value={form.cgpa || ""} onChange={e => setForm(f => ({ ...f, cgpa: parseFloat(e.target.value) || 0 }))} className="h-12 bg-slate-50 border-none rounded-xl px-4 font-medium" placeholder="e.g. 8.5" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Year of Passout</Label>
                <Input type="number" value={form.year_of_passout || ""} onChange={e => setForm(f => ({ ...f, year_of_passout: parseInt(e.target.value) || 0 }))} className="h-12 bg-slate-50 border-none rounded-xl px-4 font-medium" placeholder="YYYY" />
              </div>
            </div>
            <Button variant="outline" className="w-full h-12 border-dashed border-blue-200 text-blue-600 rounded-xl font-bold gap-2" onClick={() => toast.info("Multiple education entries feature coming soon!")}><Plus className="w-4 h-4" /> Add Another Education</Button>
          </CardContent>
        </Card>

        {/* Professional Experience - Fresher / Working Professional Toggle */}
        <Card className="border-none shadow-sm rounded-xl bg-white overflow-hidden">
          <CardHeader className="p-5 pb-4">
            <CardTitle className="text-xl font-bold flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600"><Briefcase className="w-6 h-6" /></div>
              Professional Experience
            </CardTitle>
            <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider mt-1">Select your current status</p>
          </CardHeader>
          <CardContent className="p-5 space-y-6">

            {/* Toggle Buttons */}
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, candidate_type: "FRESHER", experience_years: 0, current_company: "", working_address: "" }))}
                className={`relative flex flex-col items-center gap-2 p-5 rounded-lg border-2 transition-all font-bold text-sm ${form.candidate_type === "FRESHER"
                    ? "border-blue-500 bg-blue-50 text-blue-700 shadow-md shadow-blue-100"
                    : "border-slate-100 bg-slate-50 text-slate-400 hover:border-slate-200"
                  }`}
              >
                <GraduationCap className="w-6 h-6" />
                Fresher
                {form.candidate_type === "FRESHER" && (
                  <span className="absolute top-2 right-2 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                    <CheckCircle2 className="w-3 h-3 text-white" />
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, candidate_type: "WORKING_PROFESSIONAL", area_of_interest: "" }))}
                className={`relative flex flex-col items-center gap-2 p-5 rounded-lg border-2 transition-all font-bold text-sm ${form.candidate_type === "WORKING_PROFESSIONAL"
                    ? "border-blue-500 bg-blue-50 text-blue-700 shadow-md shadow-blue-100"
                    : "border-slate-100 bg-slate-50 text-slate-400 hover:border-slate-200"
                  }`}
              >
                <Briefcase className="w-6 h-6" />
                Working Professional
                {form.candidate_type === "WORKING_PROFESSIONAL" && (
                  <span className="absolute top-2 right-2 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                    <CheckCircle2 className="w-3 h-3 text-white" />
                  </span>
                )}
              </button>
            </div>

            {/* No selection hint */}
            {!form.candidate_type && (
              <p className="text-center text-xs text-slate-400 font-medium py-2">
                Please select your current status above to fill in the details below.
              </p>
            )}

            {/* ── FRESHER PANEL ── */}
            <div className={`space-y-4 rounded-lg p-5 border-2 transition-all ${form.candidate_type === "FRESHER"
                ? "border-blue-100 bg-blue-50/30"
                : "border-slate-100 bg-slate-50/50 opacity-40 pointer-events-none select-none"
              }`}>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                <GraduationCap className="w-4 h-4 text-blue-400" />
                Fresher Details
                {form.candidate_type !== "FRESHER" && <span className="ml-auto text-slate-300">🔒 Locked</span>}
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Domain</Label>
                  <Input
                    value={form.domain}
                    onChange={e => setForm(f => ({ ...f, domain: e.target.value }))}
                    className="h-12 bg-white border-slate-100 rounded-xl px-4 font-medium"
                    placeholder="e.g. Manufacturing, IT"
                    disabled={form.candidate_type !== "FRESHER"}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Area of Interest</Label>
                  <Input
                    value={form.area_of_interest}
                    onChange={e => setForm(f => ({ ...f, area_of_interest: e.target.value }))}
                    className="h-12 bg-white border-slate-100 rounded-xl px-4 font-medium"
                    placeholder="e.g. Quality Control, R&D"
                    disabled={form.candidate_type !== "FRESHER"}
                  />
                </div>
              </div>
            </div>

            {/* ── WORKING PROFESSIONAL PANEL ── */}
            <div className={`space-y-4 rounded-lg p-5 border-2 transition-all ${form.candidate_type === "WORKING_PROFESSIONAL"
                ? "border-blue-100 bg-blue-50/30"
                : "border-slate-100 bg-slate-50/50 opacity-40 pointer-events-none select-none"
              }`}>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-blue-400" />
                Employment Details
                {form.candidate_type !== "WORKING_PROFESSIONAL" && <span className="ml-auto text-slate-300">🔒 Locked</span>}
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Years of Experience</Label>
                  <Input
                    type="number"
                    min={1}
                    value={form.experience_years || ""}
                    onChange={e => setForm(f => ({ ...f, experience_years: parseInt(e.target.value) || 0 }))}
                    className="h-12 bg-white border-slate-100 rounded-xl px-4 font-medium"
                    placeholder="e.g. 3"
                    disabled={form.candidate_type !== "WORKING_PROFESSIONAL"}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Current Company</Label>
                  <Input
                    value={form.current_company}
                    onChange={e => setForm(f => ({ ...f, current_company: e.target.value }))}
                    className="h-12 bg-white border-slate-100 rounded-xl px-4 font-medium"
                    placeholder="e.g. AI Hiring System Ltd."
                    disabled={form.candidate_type !== "WORKING_PROFESSIONAL"}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Domain</Label>
                  <Input
                    value={form.domain}
                    onChange={e => setForm(f => ({ ...f, domain: e.target.value }))}
                    className="h-12 bg-white border-slate-100 rounded-xl px-4 font-medium"
                    placeholder="e.g. Polymer Technology"
                    disabled={form.candidate_type !== "WORKING_PROFESSIONAL"}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Working Address</Label>
                  <Input
                    value={form.working_address}
                    onChange={e => setForm(f => ({ ...f, working_address: e.target.value }))}
                    className="h-12 bg-white border-slate-100 rounded-xl px-4 font-medium"
                    placeholder="e.g. Pune, Maharashtra"
                    disabled={form.candidate_type !== "WORKING_PROFESSIONAL"}
                  />
                </div>
              </div>
            </div>

            {/* Always visible: Phone & Location */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Current Location</Label>
                <Input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} className="h-12 bg-slate-50 border-none rounded-xl px-4 font-medium" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Phone Number</Label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">+91</span>
                  <Input
                    value={form.phone.replace("+91", "")}
                    maxLength={10}
                    onChange={e => {
                      const val = e.target.value.replace(/\D/g, "");
                      if (val.length <= 10) setForm(f => ({ ...f, phone: val ? `+91${val}` : "" }));
                    }}
                    className="h-12 bg-slate-50 border-none rounded-xl pl-12 font-medium"
                    placeholder="10-digit mobile number"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Professional Summary */}
      <Card className="border-none shadow-sm rounded-xl bg-white p-5">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600"><FileText className="w-6 h-6" /></div>
          <h4 className="text-xl font-bold">Professional Summary</h4>
        </div>
        <textarea
          value={form.summary}
          onChange={e => setForm(f => ({ ...f, summary: e.target.value }))}
          className="w-full min-h-[160px] p-6 bg-slate-50 border-none rounded-lg focus:ring-2 focus:ring-blue-100 transition-all text-slate-700 font-medium leading-relaxed"
          placeholder="Briefly describe your career goals, key achievements, and what you bring to the table."
        />
        <p className="text-right text-[10px] text-slate-400 mt-2 font-bold uppercase tracking-widest">{form.summary.length} / 1000</p>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Skills Section */}
        <Card className="lg:col-span-3 border-none shadow-sm rounded-xl bg-white p-5">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600"><PenTool className="w-6 h-6" /></div>
              <h4 className="text-xl font-bold">Skills & Expertise</h4>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              className="rounded-xl border-slate-100 text-blue-600 font-bold gap-2" 
              onClick={() => autofillMutation.mutate()}
              disabled={autofillMutation.isPending}
            >
              {autofillMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              {autofillMutation.isPending ? "Parsing Resume..." : "Auto-fill from Resume"}
            </Button>
          </div>
          <div className="relative mb-6">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              ref={skillInputRef}
              placeholder="Type a skill and press Enter..."
              className="h-14 pl-12 bg-slate-50 border-none rounded-xl font-medium"
              value={skillsInput}
              onChange={e => setSkillsInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && skillsInput.trim()) {
                  if (!form.skills.includes(skillsInput.trim())) setForm(f => ({ ...f, skills: [...f.skills, skillsInput.trim()] }));
                  setSkillsInput("");
                }
              }}
            />
          </div>
          <div className="flex flex-wrap gap-3">
            {form.skills.map(s => (
              <Badge key={s} className="bg-slate-50 text-slate-600 border-none px-5 py-2.5 rounded-xl font-bold group">
                {s}
                <X className="w-3 h-3 ml-2 cursor-pointer hover:text-red-500 transition-colors" onClick={() => setForm(f => ({ ...f, skills: f.skills.filter(sk => sk !== s) }))} />
              </Badge>
            ))}
          </div>
        </Card>

        {/* Resume Info */}
        <Card className="lg:col-span-2 border-none shadow-sm rounded-xl bg-blue-600 text-white p-6 flex flex-col justify-between overflow-hidden relative">
          <div className="absolute -right-10 -bottom-10 opacity-10">
            <ShieldCheck className="w-64 h-64" />
          </div>
          <div className="space-y-4 relative z-10">
            <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center backdrop-blur-md"><FileText className="w-6 h-6" /></div>
            <h4 className="text-lg font-bold">Your Resume</h4>
            <p className="text-blue-100 leading-relaxed font-medium">Upload your resume to auto-fill your profile. Recruiters can also view your resume directly.</p>
          </div>
          <Card className="bg-white text-slate-900 border-none rounded-lg p-5 mt-6 relative z-10 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center text-red-500 shrink-0"><FileText className="w-5 h-5" /></div>
                <div className="min-w-0">
                  <p className="font-bold truncate max-w-[180px] text-sm">{candidate?.resume_path?.split("/").pop() || "No Resume"}</p>
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
                    {candidate?.updated_at ? new Date(candidate.updated_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Not uploaded'}
                  </p>
                </div>
              </div>
              <div className="flex gap-1.5">
                {candidate?.resume_path && (
                  <>
                    <Button
                      variant="outline"
                      size="icon"
                      className="w-8 h-8 rounded-lg border-slate-200 text-blue-600 hover:bg-blue-50"
                      onClick={() => window.open(`http://localhost:5000${candidate.resume_path}`, '_blank')}
                      title="View Resume"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Button>
                    <a
                      href={`http://localhost:5000${candidate.resume_path}`}
                      download
                      className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 text-green-600 hover:bg-green-50 transition-colors"
                      title="Download Resume"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </a>
                  </>
                )}
              </div>
            </div>
            {/* Resume Preview */}
            {candidate?.resume_path?.endsWith('.pdf') && (
              <div className="rounded-lg overflow-hidden border border-slate-100 bg-slate-50">
                <iframe
                  src={`http://localhost:5000${candidate.resume_path}#toolbar=0&navpanes=0`}
                  className="w-full h-[200px]"
                  title="Resume Preview"
                />
              </div>
            )}
            <div className="flex gap-2">
              <input
                type="file"
                id="resume-upload"
                className="hidden"
                accept=".pdf,.doc,.docx"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadResumeMutation.mutate(file);
                }}
              />
              <Button
                variant="outline"
                size="sm"
                className="flex-1 rounded-xl border-slate-200 text-blue-600 font-bold gap-2"
                onClick={() => document.getElementById('resume-upload')?.click()}
                disabled={uploadResumeMutation.isPending}
              >
                {uploadResumeMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                {candidate?.resume_path ? 'Change Resume' : 'Upload Resume'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 rounded-xl border-blue-200 bg-blue-50 text-blue-700 font-bold gap-2 hover:bg-blue-100"
                onClick={() => autofillMutation.mutate()}
                disabled={autofillMutation.isPending || !candidate?.resume_path}
              >
                {autofillMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                Auto-fill Profile
              </Button>
            </div>
          </Card>
        </Card>
      </div>

      {/* Safety Banner */}
      <Card className="border-none shadow-sm rounded-xl bg-blue-50/50 p-5 flex items-center gap-6">
        <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center text-blue-600"><ShieldCheck className="w-6 h-6" /></div>
        <div>
          <h4 className="font-bold text-slate-900">Your Data is Safe</h4>
          <p className="text-sm text-slate-500 mt-1">We follow a fair and confidential hiring process powered by AI. Your information is secure and will only be shared with authorized recruiters.</p>
        </div>
      </Card>
    </div>
  );
}
