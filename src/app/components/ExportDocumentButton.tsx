// app/components/ExportDocumentButton.tsx
'use client';

import { useState } from 'react';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { saveAs } from 'file-saver';
import * as docx from 'docx';
const { Document, Paragraph, TextRun, HeadingLevel, Packer, AlignmentType, BorderStyle } = docx;

interface ExportDocumentButtonProps {
    meetingId: string;
    meetingName: string;
    transcriptions: any[];
    isGenerating?: boolean;
}

type ExportFormat = 'pdf' | 'docx';

export default function ExportDocumentButton({
                                                 meetingId,
                                                 meetingName,
                                                 transcriptions,
                                                 isGenerating = false
                                             }: ExportDocumentButtonProps) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [progress, setProgress] = useState<number>(0);
    const [showOptions, setShowOptions] = useState(false);

    // Function to generate a summary using OpenAI API
    const generateSummary = async (transcriptionText: string) => {
        try {
            // Log the API request
            console.log('Sending request to generate summary API');

            // Use absolute path to ensure consistent routing
            const response = await fetch('/api/generate-summary', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    meetingId,
                    text: transcriptionText
                }),
            });

            // Log the response status
            console.log('API response status:', response.status);

            if (!response.ok) {
                throw new Error(`Error: ${response.status} - ${await response.text()}`);
            }

            const data = await response.json();
            return data.summary;
        } catch (err) {
            console.error('Error generating summary:', err);
            throw err;
        }
    };

    // Helper function to process the summary text for better formatting
    const processSummaryText = (text: string): string => {
        // Remove any extra newlines at the beginning of the text
        let processedText = text.trimStart();

        // Ensure there are proper line breaks between sections
        processedText = processedText.replace(/([^\n])# /g, '$1\n\n# ');
        processedText = processedText.replace(/([^\n])## /g, '$1\n\n## ');

        // Ensure there's space before lists
        processedText = processedText.replace(/([^\n])\n- /g, '$1\n\n- ');
        processedText = processedText.replace(/([^\n])\n\d+\. /g, '$1\n\n$2 ');

        return processedText;
    };

    // Create and download PDF
    const createAndDownloadPdf = async (transcriptionText: string, summary: string) => {
        setProgress(60);

        try {
            // Create PDF document
            const pdfDoc = await PDFDocument.create();
            const timesRomanFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);
            const timesRomanBoldFont = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
            const timesRomanItalicFont = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);

            // Add a page to the document
            const page = pdfDoc.addPage([595.28, 841.89]); // A4 size
            const { width, height } = page.getSize();

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

            // Process the summary to ensure proper formatting
            const processedSummary = processSummaryText(summary);

            // Add summary text with proper wrapping and formatting
            const summaryLines = splitTextToLines(processedSummary, 70);
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
            const transcriptLines = splitTextToLines(transcriptionText, 80);
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
    const createAndDownloadDocx = async (transcriptionText: string, summary: string) => {
        setProgress(60);

        try {
            // Process the summary to better format the markdown
            const processedSummary = processSummaryText(summary);

            // Split the summary into sections
            const sections = processedSummary.split(/\n\s*\n/);

            // Create DOCX sections and paragraphs
            const docxSections = [];

            for (const section of sections) {
                const lines = section.split('\n');

                for (const line of lines) {
                    if (line.startsWith('# ')) {
                        // Main header
                        docxSections.push(
                            new Paragraph({
                                text: line.substring(2),
                                heading: HeadingLevel.HEADING_1,
                                spacing: {
                                    before: 300,
                                    after: 200
                                },
                                color: "73604B" // Dark brown color
                            })
                        );
                    } else if (line.startsWith('## ')) {
                        // Subheader
                        docxSections.push(
                            new Paragraph({
                                text: line.substring(3),
                                heading: HeadingLevel.HEADING_2,
                                spacing: {
                                    before: 240,
                                    after: 120
                                },
                                color: "8E744B" // Medium brown color
                            })
                        );
                    } else if (line.startsWith('- ')) {
                        // Bullet point
                        docxSections.push(
                            new Paragraph({
                                text: line.substring(2),
                                bullet: {
                                    level: 0
                                },
                                spacing: {
                                    before: 60,
                                    after: 60
                                },
                                indent: {
                                    left: 720 // 0.5 inch in twips
                                }
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
                                    text: line,
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
                                text: line,
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
                    text: "Full Transcript",
                    heading: HeadingLevel.HEADING_1,
                    pageBreakBefore: true,
                    spacing: {
                        after: 200
                    },
                    color: "73604B" // Dark brown color
                })
            );

            // Process transcript lines
            const transcriptLines = transcriptionText.split('\n');
            for (const line of transcriptLines) {
                if (line.trim() !== '') {
                    // Check if this is a speaker line (e.g., "Speaker: text")
                    const speakerMatch = line.match(/^([^:]+):(.*)/);

                    if (speakerMatch && speakerMatch.length > 2) {
                        transcriptParagraphs.push(
                            new Paragraph({
                                children: [
                                    new TextRun({
                                        text: `${speakerMatch[1]}: `,
                                        bold: true,
                                    }),
                                    new TextRun({
                                        text: speakerMatch[2].trim(),
                                    }),
                                ],
                                spacing: {
                                    after: 100
                                }
                            })
                        );
                    } else {
                        transcriptParagraphs.push(
                            new Paragraph({
                                text: line,
                                spacing: {
                                    after: 100
                                }
                            })
                        );
                    }
                }
            }

            // Create the document
            const doc = new Document({
                sections: [
                    {
                        properties: {},
                        children: [
                            new Paragraph({
                                text: "Meeting Summary",
                                heading: HeadingLevel.TITLE,
                                spacing: {
                                    after: 300
                                },
                                color: "73604B" // Dark brown color
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
                                text: "Executive Summary",
                                heading: HeadingLevel.HEADING_1,
                                spacing: {
                                    after: 200
                                },
                                color: "8E744B" // Medium brown color
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
        if (transcriptions.length === 0) {
            setError('No transcriptions available to export');
            return;
        }

        setShowOptions(false);
        setLoading(true);
        setProgress(10);
        setError(null);

        try {
            // Combine all transcriptions into a single text
            const transcriptionText = transcriptions
                .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
                .map(t => `${t.speaker}: ${t.text}`)
                .join('\n\n');

            setProgress(30);

            // Generate AI summary
            const summary = await generateSummary(transcriptionText);

            // Export in the selected format
            if (format === 'pdf') {
                await createAndDownloadPdf(transcriptionText, summary);
            } else {
                await createAndDownloadDocx(transcriptionText, summary);
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

        return lines;
    };

    // For the dropdown options
    const toggleOptions = () => {
        if (!loading && transcriptions.length > 0 && !isGenerating) {
            setShowOptions(!showOptions);
        }
    };

    return (
        <div className="relative">
            <button
                onClick={toggleOptions}
                disabled={loading || isGenerating || transcriptions.length === 0}
                className={`px-4 py-2 rounded-full text-sm font-medium flex items-center
                   ${loading || isGenerating || transcriptions.length === 0
                    ? 'bg-[#99bfe8] text-[#f6f1e6] cursor-not-allowed'
                    : 'bg-[#0056b3] text-white hover:bg-[#0056b3] transition-colors'}`}
            >
                {loading ? (
                    <span>Generating ({progress}%)</span>
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