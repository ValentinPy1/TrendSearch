import { GlassmorphicCard } from "./glassmorphic-card";
import { Button } from "@/components/ui/button";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Download } from "lucide-react";
import type { Keyword } from "@shared/schema";
import jsPDF from "jspdf";

interface TrendChartProps {
  keywords: Keyword[];
  reportId: string;
  selectedKeyword: string | null;
}

export function TrendChart({ keywords, reportId, selectedKeyword }: TrendChartProps) {
  const keyword = keywords.find((k) => k.keyword === selectedKeyword) || keywords[0];

  const handleExportPDF = async () => {
    const pdf = new jsPDF();
    
    // Add gradient header
    pdf.setFillColor(147, 51, 234); // Purple
    pdf.rect(0, 0, 210, 40, "F");
    
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(24);
    pdf.text("Idea Finder Report", 20, 25);
    
    // Reset text color
    pdf.setTextColor(0, 0, 0);
    pdf.setFontSize(12);
    
    let yPosition = 60;
    
    // Keyword information
    pdf.setFontSize(16);
    pdf.text("Keyword Analysis", 20, yPosition);
    yPosition += 10;
    
    pdf.setFontSize(12);
    pdf.text(`Keyword: ${keyword.keyword}`, 20, yPosition);
    yPosition += 8;
    pdf.text(`Volume: ${keyword.volume?.toLocaleString() || "N/A"}`, 20, yPosition);
    yPosition += 8;
    pdf.text(`Competition: ${keyword.competition || "N/A"}`, 20, yPosition);
    yPosition += 8;
    pdf.text(`CPC: $${keyword.cpc || "0.00"}`, 20, yPosition);
    yPosition += 15;
    
    // All keywords table
    pdf.setFontSize(16);
    pdf.text("All Keywords", 20, yPosition);
    yPosition += 10;
    
    pdf.setFontSize(10);
    keywords.forEach((kw, index) => {
      if (yPosition > 270) {
        pdf.addPage();
        yPosition = 20;
      }
      pdf.text(
        `${index + 1}. ${kw.keyword} - Vol: ${kw.volume?.toLocaleString() || "N/A"} - CPC: $${kw.cpc || "0.00"}`,
        20,
        yPosition
      );
      yPosition += 7;
    });
    
    pdf.save(`idea-report-${reportId}.pdf`);
  };

  if (!keyword || !keyword.monthlyData) {
    return null;
  }

  return (
    <GlassmorphicCard className="p-8">
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h3 className="text-xl font-semibold text-white mb-2">
              Keyword Trend Analysis
            </h3>
            <p className="text-sm text-white/60">
              12-month search volume history for {keyword.keyword}
            </p>
          </div>
          
          <Button
            onClick={handleExportPDF}
            variant="secondary"
            className="gap-2"
            data-testid="button-export-pdf"
          >
            <Download className="h-4 w-4" />
            Export PDF
          </Button>
        </div>

        <div className="h-96">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={keyword.monthlyData}>
              <defs>
                <linearGradient id="colorVolume" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(250, 70%, 60%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(250, 70%, 60%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis 
                dataKey="month" 
                stroke="rgba(255,255,255,0.6)"
                tick={{ fill: "rgba(255,255,255,0.6)" }}
              />
              <YAxis 
                stroke="rgba(255,255,255,0.6)"
                tick={{ fill: "rgba(255,255,255,0.6)" }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "rgba(10, 10, 15, 0.9)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "8px",
                  backdropFilter: "blur(12px)",
                  color: "white",
                }}
              />
              <Line
                type="monotone"
                dataKey="volume"
                stroke="hsl(250, 70%, 60%)"
                strokeWidth={3}
                fill="url(#colorVolume)"
                dot={{ fill: "hsl(250, 70%, 60%)", r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white/5 rounded-lg p-4 border border-white/10">
          <h4 className="text-sm font-semibold text-white mb-3">Keyword Details</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-white/60 mb-1">Keyword</p>
              <p className="text-sm text-white font-medium">{keyword.keyword}</p>
            </div>
            <div>
              <p className="text-xs text-white/60 mb-1">Volume</p>
              <p className="text-sm text-white font-medium">
                {keyword.volume?.toLocaleString() || "N/A"}
              </p>
            </div>
            <div>
              <p className="text-xs text-white/60 mb-1">Competition</p>
              <p className="text-sm text-white font-medium capitalize">
                {keyword.competition || "N/A"}
              </p>
            </div>
            <div>
              <p className="text-xs text-white/60 mb-1">CPC</p>
              <p className="text-sm text-white font-medium">
                ${keyword.cpc || "0.00"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </GlassmorphicCard>
  );
}
