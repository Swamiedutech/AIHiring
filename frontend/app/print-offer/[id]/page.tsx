"use client";

import React, { useEffect } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { candidateApi } from "@/lib/api";
import { Loader2 } from "lucide-react";
import DOMPurify from 'isomorphic-dompurify';

export default function PrintOfferPage() {
  const params = useParams();
  const applicationId = String(params.id);

  const { data: offerData, isLoading } = useQuery({
    queryKey: ["offer-details-print", applicationId],
    queryFn: () => candidateApi.getOfferDetails(applicationId).then((r: any) => r.data),
  });

  useEffect(() => {
    if (offerData?.offer) {
      // Small delay to ensure styles are applied
      setTimeout(() => {
        window.print();
      }, 1000);
    }
  }, [offerData]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-white">
        <Loader2 className="w-10 h-10 animate-spin text-blue-600 mb-4" />
        <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Preparing Professional Document...</p>
      </div>
    );
  }

  const offer = offerData?.offer;

  if (!offer) return <div className="p-20 text-center">Offer not found.</div>;

  return (
    <div className="bg-white min-h-screen">
      <style jsx global>{`
        @page {
          size: A4;
          margin: 20mm;
        }
        @media print {
          body {
            margin: 0;
            padding: 0;
            background: white !important;
          }
          .no-print {
            display: none !important;
          }
        }
        .offer-container {
          max-width: 210mm;
          margin: 0 auto;
          background: white;
          font-family: 'Times New Roman', Times, serif;
          font-size: 12pt;
          line-height: 1.25;
          text-align: justify;
          color: black;
          padding: 20mm;
        }
        .offer-container p {
          margin-bottom: 1.25em;
        }
        .offer-container strong {
          font-weight: bold;
        }
      `}</style>

      <div className="offer-container">
        <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(offer.offer_letter_content) }} />
      </div>
      
      <div className="no-print fixed bottom-8 left-1/2 -translate-x-1/2 flex gap-4">
         <button 
           onClick={() => window.print()}
           className="bg-blue-600 text-white px-8 py-3 rounded-full font-bold shadow-lg hover:bg-blue-700 transition-all"
         >
           Print / Save as PDF
         </button>
         <button 
           onClick={() => window.history.back()}
           className="bg-slate-100 text-slate-600 px-8 py-3 rounded-full font-bold hover:bg-slate-200 transition-all"
         >
           Go Back
         </button>
      </div>
    </div>
  );
}
