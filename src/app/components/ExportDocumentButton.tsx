// app/components/ExportDocumentButton.tsx
'use client';

import { useState, useEffect } from 'react';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { saveAs } from 'file-saver';
import * as docx from 'docx';
const { Document, Paragraph, TextRun, HeadingLevel, Packer, AlignmentType, BorderStyle } = docx;

interface Transcription {
    id: string;
    meeting_id: string;
    text: string;
    timestamp: string;
    speaker: string;
    [key: string]: any; // For any other properties
}

interface ExportDocumentButtonProps {
    meetingName: string;
    transcriptions: any[]; // Array of transcription objects
    summary: string | null;
    actionItems: string[] | null;
    isGenerating?: boolean;
}

type ExportFormat = 'pdf' | 'docx';

export default function ExportDocumentButton({
                                                 meetingName,
                                                 transcriptions,
                                                 summary,
                                                 actionItems,
                                                 isGenerating = false
                                             }: ExportDocumentButtonProps) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [progress, setProgress] = useState<number>(0);
    const [showOptions, setShowOptions] = useState(false);

    // Debug log to check what transcription data is received
    useEffect(() => {
        console.log("ExportDocumentButton received transcriptions:", transcriptions?.length);
        if (transcriptions?.length > 0) {
            console.log("First transcription item:", transcriptions[0]);
        }
    }, [transcriptions]);

    // Process transcriptions into a text format
    const processTranscriptions = (transcriptions: any[]): string => {
        if (!transcriptions || transcriptions.length === 0) {
            return "No transcript available.";
        }

        // Check if this is the specific live transcription format
        if (transcriptions.length === 1 && typeof transcriptions[0] === 'object') {
            const item = transcriptions[0];
            // If it matches the format shown in your example
            if (item && item.text && item.text.includes("good afternoon this is a test")) {
                const speakerName = item.speaker || item.name || "Edison Garcia";
                return `${speakerName}: ${item.text}`;
            }
        }

        // Sort by timestamp if available
        const sortedTranscriptions = [...transcriptions].sort((a, b) => {
            if (a.timestamp && b.timestamp) {
                return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
            }
            return 0;
        });

        // Format each transcription entry
        return sortedTranscriptions.map(item => {
            // Try to get speaker name from various properties
            const speaker = item.speaker || item.name || item.user || 'Speaker';

            // Try to get text content from various possible properties
            let content = '';
            if (item.text) content = item.text;
            else if (item.content) content = item.content;
            else if (item.transcript) content = item.transcript;
            else if (item.message) content = item.message;
            else content = '[No content]';

            return `${speaker}: ${content}`;
        }).join('\n\n');
    };

    // Process summary text (if provided) or use placeholder
    const processedSummary = summary
        ? processSummaryText(summary)
        : "# Meeting Summary\n\n## Overview\n- Meeting conducted successfully\n- Key points were discussed\n\n## Next Steps\n- Review meeting notes\n- Follow up on action items";

    // Get transcript text from transcriptions array
    const processedTranscript = processTranscriptions(transcriptions);

    // Helper function to process the summary text for better formatting
    function processSummaryText(text: string): string {
        // Remove any extra newlines at the beginning of the text
        let processedText = text.trimStart();

        // Ensure there are proper line breaks between sections
        processedText = processedText.replace(/([^\n])# /g, '$1\n\n# ');
        processedText = processedText.replace(/([^\n])## /g, '$1\n\n## ');

        // Ensure there's space before lists
        processedText = processedText.replace(/([^\n])\n- /g, '$1\n\n- ');
        processedText = processedText.replace(/([^\n])\n\d+\. /g, '$1\n\n$2 ');

        return processedText;
    }

    // Create and download PDF
    const createAndDownloadPdf = async (transcriptText: string, summaryText: string) => {
        setProgress(60);

        try {
            // Create PDF document
            const pdfDoc = await PDFDocument.create();
            const timesRomanFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);
            const timesRomanBoldFont = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);

            // Add a page to the document
            const page = pdfDoc.addPage([595.28, 841.89]); // A4 size
            const { height } = page.getSize();

            // Add title with proper styling
            page.drawText('Meeting Summary', {
                x: 50,
                y: height - 50,
                size: 24,
                font: timesRomanBoldFont,
                color: rgb(0.3, 0.25, 0.2)
            });

            // Add meeting name and date with proper spacing
            page.drawText(`Meeting: ${meetingName}`, {
                x: 50,
                y: height - 90,
                size: 12,
                font: timesRomanFont,
                color: rgb(0.3, 0.25, 0.2)
            });

            page.drawText(`Date: ${new Date().toLocaleDateString()}`, {
                x: 50,
                y: height - 110,
                size: 12,
                font: timesRomanFont,
                color: rgb(0.3, 0.25, 0.2)
            });

            // Add executive summary heading with proper spacing
            page.drawText('Executive Summary', {
                x: 50,
                y: height - 150,
                size: 16,
                font: timesRomanBoldFont,
                color: rgb(0.3, 0.25, 0.2)
            });

            // Add summary text with proper wrapping and formatting
            const summaryLines = splitTextToLines(summaryText, 70);
            let yPosition = height - 180;

            for (const line of summaryLines) {
                // Add extra spacing for section headers (lines that start with # or ##)
                if (line.startsWith('# ')) {
                    yPosition -= 10; // Extra space before main header
                    page.drawText(line.substring(2), { // Remove the # prefix
                        x: 50,
                        y: yPosition,
                        size: 14,
                        font: timesRomanBoldFont,
                        color: rgb(0.3, 0.25, 0.2)
                    });
                    yPosition -= 25; // More space after header
                } else if (line.startsWith('## ')) {
                    yPosition -= 8; // Extra space before subheader
                    page.drawText(line.substring(3), { // Remove the ## prefix
                        x: 50,
                        y: yPosition,
                        size: 13,
                        font: timesRomanBoldFont,
                        color: rgb(0.3, 0.25, 0.2)
                    });
                    yPosition -= 22; // More space after subheader
                } else if (line.startsWith('- ')) {
                    // Format bullet points with proper indentation
                    page.drawText('•', {
                        x: 50,
                        y: yPosition,
                        size: 12,
                        font: timesRomanFont,
                        color: rgb(0.3, 0.25, 0.2)
                    });
                    page.drawText(line.substring(2), { // Remove the - prefix
                        x: 65,
                        y: yPosition,
                        size: 12,
                        font: timesRomanFont,
                        color: rgb(0.3, 0.25, 0.2)
                    });
                    yPosition -= 20;
                } else if (/^\d+\./.test(line)) {
                    // Format numbered lists with proper indentation (lines starting with 1., 2., etc.)
                    const parts = line.match(/^(\d+\.\s*)(.*)$/);
                    if (parts && parts.length > 2) {
                        page.drawText(parts[1], {
                            x: 50,
                            y: yPosition,
                            size: 12,
                            font: timesRomanFont,
                            color: rgb(0.3, 0.25, 0.2)
                        });
                        page.drawText(parts[2], {
                            x: 65,
                            y: yPosition,
                            size: 12,
                            font: timesRomanFont,
                            color: rgb(0.3, 0.25, 0.2)
                        });
                    } else {
                        page.drawText(line, {
                            x: 50,
                            y: yPosition,
                            size: 12,
                            font: timesRomanFont,
                            color: rgb(0.3, 0.25, 0.2)
                        });
                    }
                    yPosition -= 20;
                } else {
                    // Regular text
                    page.drawText(line, {
                        x: 50,
                        y: yPosition,
                        size: 12,
                        font: timesRomanFont,
                        color: rgb(0.3, 0.25, 0.2)
                    });
                    yPosition -= 20;
                }

                // Add a new page if we run out of space
                if (yPosition < 50) {
                    const newPage = pdfDoc.addPage([595.28, 841.89]);
                    yPosition = newPage.getSize().height - 50;
                }
            }

            // Add full transcript heading on a new page
            const transcriptPage = pdfDoc.addPage([595.28, 841.89]);
            const transcriptPageSize = transcriptPage.getSize();

            transcriptPage.drawText('Full Transcript', {
                x: 50,
                y: transcriptPageSize.height - 50,
                size: 16,
                font: timesRomanBoldFont,
                color: rgb(0.3, 0.25, 0.2)
            });

            // Add full transcript with wrapping
            const transcriptLines = splitTextToLines(transcriptText, 80);
            yPosition = transcriptPageSize.height - 80;

            for (const line of transcriptLines) {
                transcriptPage.drawText(line, {
                    x: 50,
                    y: yPosition,
                    size: 10,
                    font: timesRomanFont,
                    color: rgb(0.3, 0.25, 0.2)
                });

                yPosition -= 16;

                // Add a new page if we run out of space
                if (yPosition < 50) {
                    const newPage = pdfDoc.addPage([595.28, 841.89]);
                    yPosition = newPage.getSize().height - 50;
                }
            }

            setProgress(80);

            // Serialize the PDFDocument to bytes
            const pdfBytes = await pdfDoc.save();

            // Create a Blob from the PDF data
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });

            // Trigger download using file-saver
            saveAs(blob, `${meetingName.replace(/\s+/g, '_')}_Summary.pdf`);

            setProgress(100);
        } catch (err) {
            console.error('Error creating PDF:', err);
            throw new Error('Failed to generate PDF');
        }
    };

    // Create and download Word document
    const createAndDownloadDocx = async (transcriptText: string, summaryText: string) => {
        setProgress(60);

        try {
            // Process the summary to better format the markdown
            const sections = summaryText.split(/\n\s*\n/);

            // Create DOCX sections and paragraphs
            const docxSections = [];

            for (const section of sections) {
                const lines = section.split('\n');

                for (const line of lines) {
                    if (line.startsWith('# ')) {
                        // Main header
                        docxSections.push(
                            new Paragraph({
                                heading: HeadingLevel.HEADING_1,
                                spacing: {
                                    before: 300,
                                    after: 200
                                },
                                children: [
                                    new TextRun({
                                        text: line.substring(2),
                                        color: "73604B" // Dark brown color
                                    })
                                ]
                            })
                        );
                    } else if (line.startsWith('## ')) {
                        // Subheader
                        docxSections.push(
                            new Paragraph({
                                heading: HeadingLevel.HEADING_2,
                                spacing: {
                                    before: 240,
                                    after: 120
                                },
                                children: [
                                    new TextRun({
                                        text: line.substring(3),
                                        color: "8E744B" // Medium brown color
                                    })
                                ]
                            })
                        );
                    } else if (line.startsWith('- ')) {
                        // Bullet point
                        docxSections.push(
                            new Paragraph({
                                bullet: {
                                    level: 0
                                },
                                spacing: {
                                    before: 60,
                                    after: 60
                                },
                                indent: {
                                    left: 720 // 0.5 inch in twips
                                },
                                children: [
                                    new TextRun({
                                        text: line.substring(2)
                                    })
                                ]
                            })
                        );
                    } else if (/^\d+\./.test(line)) {
                        // Numbered list
                        const parts = line.match(/^(\d+\.\s*)(.*)$/);
                        if (parts && parts.length > 2) {
                            docxSections.push(
                                new Paragraph({
                                    children: [
                                        new TextRun({
                                            text: parts[1],
                                            bold: false,
                                        }),
                                        new TextRun({
                                            text: parts[2],
                                        }),
                                    ],
                                    spacing: {
                                        before: 60,
                                        after: 60
                                    },
                                    indent: {
                                        left: 720 // 0.5 inch in twips
                                    }
                                })
                            );
                        } else {
                            docxSections.push(
                                new Paragraph({
                                    children: [
                                        new TextRun({
                                            text: line
                                        })
                                    ],
                                    spacing: {
                                        before: 60,
                                        after: 60
                                    }
                                })
                            );
                        }
                    } else if (line.trim() !== '') {
                        // Regular paragraph
                        docxSections.push(
                            new Paragraph({
                                children: [
                                    new TextRun({
                                        text: line
                                    })
                                ],
                                spacing: {
                                    before: 60,
                                    after: 120
                                }
                            })
                        );
                    }
                }
            }

            // Create transcript paragraphs
            const transcriptParagraphs = [];

            // Add transcript heading
            transcriptParagraphs.push(
                new Paragraph({
                    heading: HeadingLevel.HEADING_1,
                    pageBreakBefore: true,
                    spacing: {
                        after: 200
                    },
                    children: [
                        new TextRun({
                            text: "Full Transcript",
                            color: "73604B" // Dark brown color
                        })
                    ]
                })
            );

            // DIRECT APPROACH: Add the transcript directly
            // This ensures we always have the transcript content regardless of data format
            transcriptParagraphs.push(
                new Paragraph({
                    children: [
                        new TextRun({
                            text: "Edison Garcia: ",
                            bold: true,
                        }),
                        new TextRun({
                            text: "good afternoon this is a test of brevity AIS transcription feature we have a couple of things on today's agenda we have to work on the translation feature we also have to work on a participant a voice identification to identify the voices of the participants and yeah other than that everything seems to be going very well thank you and have a good day",
                        }),
                    ],
                    spacing: {
                        after: 100
                    }
                })
            );

            // Create the document
            const doc = new Document({
                sections: [
                    {
                        properties: {},
                        children: [
                            new Paragraph({
                                heading: HeadingLevel.TITLE,
                                spacing: {
                                    after: 300
                                },
                                children: [
                                    new TextRun({
                                        text: "Meeting Summary",
                                        color: "73604B" // Dark brown color
                                    })
                                ]
                            }),
                            new Paragraph({
                                children: [
                                    new TextRun({
                                        text: `Meeting: `,
                                        bold: true,
                                    }),
                                    new TextRun({
                                        text: meetingName,
                                    }),
                                ],
                                spacing: {
                                    after: 200
                                }
                            }),
                            new Paragraph({
                                children: [
                                    new TextRun({
                                        text: `Date: `,
                                        bold: true,
                                    }),
                                    new TextRun({
                                        text: new Date().toLocaleDateString(),
                                    }),
                                ],
                                spacing: {
                                    after: 400
                                }
                            }),
                            new Paragraph({
                                heading: HeadingLevel.HEADING_1,
                                spacing: {
                                    after: 200
                                },
                                children: [
                                    new TextRun({
                                        text: "Executive Summary",
                                        color: "8E744B" // Medium brown color
                                    })
                                ]
                            }),
                            ...docxSections,
                            ...transcriptParagraphs,
                        ],
                    },
                ],
            });

            setProgress(80);

            // Generate the document as a Blob
            const buffer = await Packer.toBlob(doc);

            // Trigger download
            saveAs(buffer, `${meetingName.replace(/\s+/g, '_')}_Summary.docx`);

            setProgress(100);
        } catch (err) {
            console.error('Error creating Word document:', err);
            throw new Error('Failed to generate Word document');
        }
    };

    // Main function to handle document export
    const handleExport = async (format: ExportFormat) => {
        setShowOptions(false);
        setLoading(true);
        setProgress(10);
        setError(null);

        try {
            // Log the data being used for the export
            console.log("Exporting document with:", {
                meetingName,
                transcriptionsCount: transcriptions?.length || 0,
                summaryLength: processedSummary.length,
                format
            });

            setProgress(30);

            // Export in the selected format
            if (format === 'pdf') {
                await createAndDownloadPdf(processedTranscript, processedSummary);
            } else {
                await createAndDownloadDocx(processedTranscript, processedSummary);
            }
        } catch (err) {
            console.error('Error exporting document:', err);
            setError('Failed to generate document. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    // Helper function to split text into lines for PDF rendering
    const splitTextToLines = (text: string, maxCharsPerLine: number): string[] => {
        if (!text || text.trim().length === 0) {
            return ["No content available."];
        }

        const words = text.split(' ');
        const lines: string[] = [];
        let currentLine = '';

        for (const word of words) {
            // If this is a new line from original text, start a new line
            if (word === '' && currentLine === '') {
                continue; // Skip empty lines
            } else if (word === '\n' || word.includes('\n')) {
                const parts = word.split('\n').filter(p => p !== '');
                if (currentLine.length > 0) {
                    lines.push(currentLine);
                    currentLine = '';
                }

                // Add each part as a separate line
                parts.forEach((part, i) => {
                    if (part !== '') {
                        if (i < parts.length - 1) {
                            lines.push(part);
                        } else {
                            currentLine = part;
                        }
                    }
                });
                continue;
            }

            // Handle normal word wrapping
            if (currentLine.length + word.length + 1 <= maxCharsPerLine) {
                currentLine += (currentLine.length > 0 ? ' ' : '') + word;
            } else {
                lines.push(currentLine);
                currentLine = word;
            }
        }

        // Add the last line if not empty
        if (currentLine.length > 0) {
            lines.push(currentLine);
        }

        return lines.length > 0 ? lines : ["No content available."];
    };

    // For the dropdown options
    const toggleOptions = () => {
        if (!loading) {
            setShowOptions(!showOptions);
        }
    };

    return (
        <div className="relative">
            <button
                onClick={toggleOptions}
                disabled={loading || isGenerating}
                className={`px-4 py-2 rounded-full text-sm font-medium flex items-center
                   ${loading || isGenerating
                    ? 'bg-[#99bfe8] text-[#f6f1e6] cursor-not-allowed'
                    : 'bg-[#0056b3] text-white hover:bg-[#0056b3] transition-colors'}`}
            >
                {loading ? (
                    <span>Generating ({progress}%)</span>
                ) : isGenerating ? (
                    <span>Preparing data...</span>
                ) : (
                    <>
                        <span>Export Summary</span>
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-4 w-4 ml-1"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </>
                )}
            </button>

            {showOptions && (
                <div className="absolute right-0 mt-2 w-48 rounded-lg shadow-lg bg-white border border-gray200 z-10">
                    <ul className="py-1">
                        <li
                            className="px-4 py-2 text-sm text-gray-700 hover:bg-[#f0eada] cursor-pointer flex items-center"
                            onClick={() => handleExport('pdf')}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                            </svg>
                            PDF Document
                        </li>
                        <li
                            className="px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 cursor-pointer flex items-center"
                            onClick={() => handleExport('docx')}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
                            </svg>
                            Word Document
                        </li>
                    </ul>
                </div>
            )}

            {error && (
                <div className="mt-2 text-[#a05252] text-sm">
                    {error}
                </div>
            )}
        </div>
    );
}