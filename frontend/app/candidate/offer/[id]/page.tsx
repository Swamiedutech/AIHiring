"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { candidateApi } from "@/lib/api";
import { useUIStore } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
   FileCheck, Download, CheckCircle, XCircle,
   Calendar, CreditCard, User, Building, Loader2,
   Sparkles, ShieldCheck, Mail, Info, ArrowLeft,
   ChevronRight, Printer
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import DOMPurify from 'isomorphic-dompurify';
export default function OfferLetterPage() {
   const params = useParams();
   const applicationId = String(params.id);
   const router = useRouter();
   const { setPageTitle } = useUIStore();
   const [notes, setNotes] = useState("");

   const { data: offerData, isLoading, error } = useQuery({
      queryKey: ["offer-details", applicationId],
      queryFn: () => candidateApi.getOfferDetails(applicationId).then((r: any) => r.data),
   });

   useEffect(() => {
      setPageTitle("Job Offer");
   }, []);

   // Auto-trigger print if requested via query param
   useEffect(() => {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('print') === 'true' && offerData?.offer) {
         const timer = setTimeout(() => {
            window.print();
            // Clean up the URL to prevent re-printing on manual refresh
            window.history.replaceState({}, '', window.location.pathname);
         }, 1200); // Slight delay to ensure content is painted
         return () => clearTimeout(timer);
      }
   }, [offerData]);

   const mutation = useMutation({
      mutationFn: (decision: string) =>
         candidateApi.respondOffer({ application_id: applicationId, decision, candidate_notes: notes }),
      onSuccess: () => {
         toast.success("Response recorded successfully!");
         router.push("/candidate");
      },
      onError: (err: any) => {
         toast.error("Error: " + (err.response?.data?.message || err.message));
      }
   });

   if (isLoading) return <div className="p-20 text-center animate-pulse text-slate-400 font-bold uppercase tracking-widest">Generating Offer Document...</div>;

   const offer = offerData?.offer;

   if (!offer) {
      return (
         <div className="max-w-2xl mx-auto py-20 text-center space-y-6">
            <div className="w-20 h-12 bg-slate-50 rounded-lg flex items-center justify-center mx-auto text-slate-200">
               <FileCheck className="w-10 h-10" />
            </div>
            <div>
               <h3 className="text-lg font-bold text-slate-900">No offer found</h3>
               <p className="text-slate-500 font-medium mt-2 leading-relaxed">Your application status has not reached the offer stage yet. We'll notify you once a decision is made.</p>
            </div>
            <Button onClick={() => router.push("/candidate")} className="bg-slate-900 hover:bg-black text-white h-12 px-5 rounded-xl font-bold">Return to Dashboard</Button>
         </div>
      );
   }

   const isResponded = offer.status !== "PENDING";

   return (
      <div className="max-w-6xl mx-auto space-y-10 pb-12">
         {/* Header */}
         <div className="flex items-center justify-between">
            <Button variant="ghost" onClick={() => router.push(`/candidate/application/${applicationId}`)} className="gap-2 text-slate-500 hover:text-slate-900 font-bold transition-all px-0">
               <ArrowLeft className="w-5 h-5" /> Back to Details
            </Button>
            <div className="flex gap-4">
               {isResponded && offer.status === "ACCEPTED" && (
                  <Button variant="outline" onClick={() => router.push(`/print-offer/${applicationId}`)} className="h-12 px-6 rounded-xl font-bold gap-2 border-slate-200">
                     <Printer className="w-4 h-4" /> Print Offer
                  </Button>
               )}
            </div>
         </div>

         <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8 space-y-10">
               {/* Banner Card */}
               <Card className={cn(
                  "border-none shadow-sm rounded-[40px] p-6 text-white relative overflow-hidden",
                  offer.status === "ACCEPTED" ? "bg-emerald-600" :
                     offer.status === "REJECTED" ? "bg-red-600" :
                        "bg-blue-600"
               )}>
                  <div className="relative z-10 space-y-6">
                     <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                           <Sparkles className="w-6 h-6 text-white" />
                        </div>
                        <Badge className="bg-white/20 text-white border-none font-black text-[10px] uppercase tracking-[0.2em]">Official Release</Badge>
                     </div>
                     <div>
                        <h1 className="text-lg font-black tracking-tight leading-tight uppercase italic">Congratulations!</h1>
                        <p className="text-blue-50/80 font-medium text-lg mt-2">You have been selected to join AI Hiring System.</p>
                     </div>
                  </div>
                  <div className="absolute top-0 right-0 p-12 opacity-10"><ShieldCheck className="w-48 h-48" /></div>
               </Card>

               <Card id="printable-offer" className="border-none shadow-sm rounded-[40px] bg-white overflow-hidden">
                  <div className="p-6 border-b border-slate-50 bg-slate-50/30 flex items-center justify-between no-print">
                     <h3 className="text-xl font-black text-slate-900 flex items-center gap-3">
                        <FileCheck className="w-6 h-6 text-blue-600" /> Offer of Employment
                     </h3>
                     <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Document ID: #OFF-${applicationId.slice(-6).toUpperCase()}</p>
                  </div>
                  <div className="p-6 lg:p-14">
                     <div
                        className="prose prose-slate max-w-none prose-p:text-slate-600 prose-p:leading-relaxed prose-strong:text-slate-900 prose-h4:text-slate-900"
                        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(offer.offer_letter_content) }}
                     />
                  </div>
               </Card>
            </div>

            <div className="lg:col-span-4 space-y-10">
               {/* Summary Stats */}
               <Card className="border-none shadow-sm rounded-[40px] bg-white p-6 space-y-8">
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Employment Summary</h4>
                  <div className="space-y-6">
                     {[
                        { label: "Position", val: offer.position_title, icon: Building, color: "text-blue-600", bg: "bg-blue-50" },
                        { label: "Annual CTC", val: `₹${offer.salary?.toLocaleString()}`, icon: CreditCard, color: "text-emerald-600", bg: "bg-emerald-50" },
                        { label: "Joining Date", val: new Date(offer.joining_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }), icon: Calendar, color: "text-purple-600", bg: "bg-purple-50" }
                     ].map((item, i) => (
                        <div key={i} className="flex items-start gap-4">
                           <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", item.bg, item.color)}>
                              <item.icon className="w-5 h-5" />
                           </div>
                           <div>
                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">{item.label}</p>
                              <p className="font-bold text-slate-900 text-sm">{item.val}</p>
                           </div>
                        </div>
                     ))}
                  </div>
               </Card>

               {/* Response Section */}
               {!isResponded ? (
                  <Card className="border-none shadow-sm rounded-[40px] bg-slate-900 p-6 text-white space-y-8">
                     <div className="space-y-2">
                        <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Candidate Decision</p>
                        <h4 className="text-xl font-bold">Review your response</h4>
                     </div>
                     <div className="space-y-4">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Notes for Hiring Team</label>
                        <Textarea
                           placeholder="Add any message or questions..."
                           className="bg-slate-800 border-none rounded-lg h-14 text-white text-sm focus:ring-1 focus:ring-blue-600 resize-none"
                           value={notes}
                           onChange={(e) => setNotes(e.target.value)}
                        />
                     </div>
                     <div className="flex flex-col gap-3">
                        <Button
                           className="w-full h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-black uppercase tracking-widest transition-all"
                           onClick={() => mutation.mutate("ACCEPTED")}
                           disabled={mutation.isPending}
                        >
                           {mutation.isPending ? <Loader2 className="animate-spin w-4 h-4" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                           Accept Offer
                        </Button>
                        <Button
                           variant="ghost"
                           className="w-full h-14 text-red-500 hover:bg-red-500/10 hover:text-red-500 rounded-lg font-bold uppercase tracking-widest text-xs"
                           onClick={() => mutation.mutate("REJECTED")}
                           disabled={mutation.isPending}
                        >
                           Reject Offer
                        </Button>
                     </div>
                     <p className="text-[10px] text-slate-500 text-center font-medium leading-relaxed">
                        By accepting, you confirm your availability to join on the mentioned date.
                     </p>
                  </Card>
               ) : (
                  <Card className={cn(
                     "border-none shadow-sm rounded-[40px] p-6 text-center space-y-6",
                     offer.status === "ACCEPTED" ? "bg-emerald-50" : "bg-red-50"
                  )}>
                     <div className={cn(
                        "w-20 h-12 rounded-full flex items-center justify-center mx-auto shadow-sm",
                        offer.status === "ACCEPTED" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
                     )}>
                        {offer.status === "ACCEPTED" ? <CheckCircle className="w-10 h-10" /> : <XCircle className="w-10 h-10" />}
                     </div>
                     <div>
                        <h3 className={cn("text-xl font-black uppercase tracking-tighter", offer.status === "ACCEPTED" ? "text-emerald-900" : "text-red-900")}>
                           Offer {offer.status}
                        </h3>
                        <p className={cn("text-sm font-medium mt-2 leading-relaxed", offer.status === "ACCEPTED" ? "text-emerald-700" : "text-red-700")}>
                           {offer.status === "ACCEPTED"
                              ? "Welcome to the team! Our onboarding team will contact you shortly with the next steps."
                              : "You have declined this offer. We wish you success in your future career path."}
                        </p>
                     </div>
                     {offer.status === "ACCEPTED" && (
                        <Button variant="outline" className="w-full h-12 rounded-xl font-bold border-emerald-200 text-emerald-700 bg-white" onClick={() => router.push(`/print-offer/${applicationId}`)}>
                           <Download className="w-4 h-4 mr-2" /> Download Copy
                        </Button>
                     )}
                  </Card>
               )}
            </div>
         </div>
      </div>
   );
}
