'use client';

import React, { useState } from 'react';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { saveAs } from 'file-saver';
import * as docx from 'docx';
const { Document, Paragraph, TextRun, HeadingLevel, Packer, AlignmentType, BorderStyle } = docx;

interface ExportDocumentButtonProps {
    meetingName: string;
    transcript: string;
    summary: string | null;
    actionItems: string[] | null;
}

const ExportDocumentButton: React.FC<ExportDocumentButtonProps> = ({
                                                                       meetingName,
                                                                       transcript,
                                                                       summary,
                                                                       actionItems,
                                                                   }) => {
    const [isExporting, setIsExporting] = useState(false);
    const [exportFormat, setExportFormat] = useState<'pdf' | 'docx'>('pdf');

    const handleExport = async () => {
        try {
            setIsExporting(true);

            if (exportFormat === 'pdf') {
                await exportToPdf();
            } else {
                await exportToDocx();
            }
        } catch (error) {
            console.error('Error exporting document:', error);
            alert('An error occurred while exporting the document. Please try again.');
        } finally {
            setIsExporting(false);
        }
    };

    const exportToPdf = async () => {
        const pdfDoc = await PDFDocument.create();
        const timesRomanFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);
        const timesRomanBoldFont = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);

        const page = pdfDoc.addPage();
        const { width, height } = page.getSize();
        const margin = 50;
        let y = height - margin;
        const lineHeight = 16;
        const headerLineHeight = 24;

        // Title
        page.drawText(meetingName, {
            x: margin,
            y,
            size: 24,
            font: timesRomanBoldFont,
            color: rgb(0.27, 0.23, 0.18), // Dark brown
        });
        y -= headerLineHeight * 2;

        // Summary Section
        if (summary) {
            page.drawText('Summary', {
                x: margin,
                y,
                size: 18,
                font: timesRomanBoldFont,
                color: rgb(0.27, 0.23, 0.18), // Dark brown
            });
            y -= headerLineHeight;

            const summaryLines = summary.split('\n');
            for (const line of summaryLines) {
                if (y < margin) {
                    const newPage = pdfDoc.addPage();
                    y = height - margin;
                }

                page.drawText(line, {
                    x: margin,
                    y,
                    size: 12,
                    font: timesRomanFont,
                    color: rgb(0, 0, 0),
                });
                y -= lineHeight;
            }
            y -= lineHeight;
        }

        // Action Items Section
        if (actionItems && actionItems.length > 0) {
            if (y < margin + headerLineHeight) {
                const newPage = pdfDoc.addPage();
                y = height - margin;
            }

            page.drawText('Action Items', {
                x: margin,
                y,
                size: 18,
                font: timesRomanBoldFont,
                color: rgb(0.27, 0.23, 0.18), // Dark brown
            });
            y -= headerLineHeight;

            for (const item of actionItems) {
                if (y < margin) {
                    const newPage = pdfDoc.addPage();
                    y = height - margin;
                }

                page.drawText(`• ${item}`, {
                    x: margin,
                    y,
                    size: 12,
                    font: timesRomanFont,
                    color: rgb(0, 0, 0),
                });
                y -= lineHeight;
            }
            y -= lineHeight;
        }

        // Transcript Section
        if (transcript) {
            if (y < margin + headerLineHeight) {
                const newPage = pdfDoc.addPage();
                y = height - margin;
            }

            page.drawText('Transcript', {
                x: margin,
                y,
                size: 18,
                font: timesRomanBoldFont,
                color: rgb(0.27, 0.23, 0.18), // Dark brown
            });
            y -= headerLineHeight;

            const transcriptLines = transcript.split('\n');
            for (const line of transcriptLines) {
                if (y < margin) {
                    const newPage = pdfDoc.addPage();
                    y = height - margin;
                }

                page.drawText(line, {
                    x: margin,
                    y,
                    size: 10,
                    font: timesRomanFont,
                    color: rgb(0.2, 0.2, 0.2), // Dark gray
                });
                y -= lineHeight;
            }
        }

        const pdfBytes = await pdfDoc.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        saveAs(blob, `${meetingName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_meeting.pdf`);
    };

    const exportToDocx = async () => {
        const doc = new Document({
            sections: [{
                properties: {},
                children: [
                    // Document Title
                    new Paragraph({
                        heading: HeadingLevel.TITLE,
                        children: [
                            new TextRun({
                                text: meetingName,
                                color: "73604B" // Dark brown color
                            })
                        ],
                        spacing: {
                            after: 300
                        }
                    }),

                    // Summary Section
                    ...(summary ? [
                        new Paragraph({
                            heading: HeadingLevel.HEADING_1,
                            children: [
                                new TextRun({
                                    text: "Summary",
                                    color: "73604B" // Dark brown color
                                })
                            ],
                            spacing: {
                                after: 200
                            }
                        }),
                        ...summary.split('\n').map(line => {
                            if (line.startsWith('# ')) {
                                return new Paragraph({
                                    heading: HeadingLevel.HEADING_1,
                                    spacing: {
                                        after: 200
                                    },
                                    children: [
                                        new TextRun({
                                            text: line.slice(2), // Remove the '# ' part
                                            color: "73604B" // Dark brown color
                                        })
                                    ]
                                });
                            } else if (line.startsWith('## ')) {
                                return new Paragraph({
                                    heading: HeadingLevel.HEADING_2,
                                    spacing: {
                                        after: 200
                                    },
                                    children: [
                                        new TextRun({
                                            text: line.slice(3), // Remove the '## ' part
                                            color: "73604B" // Dark brown color
                                        })
                                    ]
                                });
                            } else {
                                return new Paragraph({
                                    text: line,
                                    spacing: {
                                        after: 120
                                    }
                                });
                            }
                        })
                    ] : []),

                    // Action Items Section
                    ...(actionItems && actionItems.length > 0 ? [
                        new Paragraph({
                            heading: HeadingLevel.HEADING_1,
                            children: [
                                new TextRun({
                                    text: "Action Items",
                                    color: "73604B" // Dark brown color
                                })
                            ],
                            spacing: {
                                before: 300,
                                after: 200
                            }
                        }),
                        ...actionItems.map(item => new Paragraph({
                            text: `• ${item}`,
                            spacing: {
                                after: 120
                            }
                        }))
                    ] : []),

                    // Transcript Section
                    ...(transcript ? [
                        new Paragraph({
                            heading: HeadingLevel.HEADING_1,
                            children: [
                                new TextRun({
                                    text: "Transcript",
                                    color: "73604B" // Dark brown color
                                })
                            ],
                            spacing: {
                                before: 300,
                                after: 200
                            }
                        }),
                        ...transcript.split('\n').map(line => new Paragraph({
                            text: line,
                            spacing: {
                                after: 80
                            }
                        }))
                    ] : [])
                ]
            }]
        });

        const buffer = await Packer.toBuffer(doc);
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
        saveAs(blob, `${meetingName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_meeting.docx`);
    };

    return (
        <div className="flex flex-col space-y-2">
            <div className="flex space-x-2">
                <select
                    value={exportFormat}
                    onChange={(e) => setExportFormat(e.target.value as 'pdf' | 'docx')}
                    className="px-3 py-2 border border-[#e6f2ff] rounded-lg bg-white shadow-sm focus:border-[#0056b3] focus:ring-[#0056b3] text-sm text-[#2c3e50]"
                >
                    <option value="pdf">PDF</option>
                    <option value="docx">Word Document</option>
                </select>

                <button
                    onClick={handleExport}
                    disabled={isExporting}
                    className={`flex items-center justify-center px-4 py-2 bg-[#0056b3] text-white rounded-lg hover:bg-[#003d82] transition-colors ${
                        isExporting ? 'opacity-70 cursor-not-allowed' : ''
                    }`}
                >
                    {isExporting ? (
                        <>
                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Exporting...
                        </>
                    ) : (
                        <>
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 mr-1">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                            </svg>
                            Export
                        </>
                    )}
                </button>
            </div>
        </div>
    );
};

export default ExportDocumentButton;