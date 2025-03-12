// app/api/enhance-text/route.ts
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

// Initialize OpenAI client (if API key is available)
let openai: OpenAI | null = null;
if (process.env.OPENAI_API_KEY) {
    openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
    });
}

export async function POST(req: NextRequest) {
    try {
        // Parse request body
        const body = await req.json();
        const { text } = body;

        if (!text) {
            return NextResponse.json(
                { error: 'Missing text field' },
                { status: 400 }
            );
        }

        // If OpenAI is not available, use basic formatting
        if (!openai) {
            const basicFormatted = basicFormatText(text);
            return NextResponse.json({ enhancedText: basicFormatted });
        }

        // Use OpenAI to fix grammar and punctuation
        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                {
                    role: "system",
                    content: `You are a text formatter that corrects capitalization and adds proper punctuation. 
                    Preserve the original meaning completely.
                    Correct capitalization at the start of sentences.
                    Add periods where sentences end if missing.
                    Fix obvious grammatical errors.
                    Only return the formatted text without explanations.`
                },
                {
                    role: "user",
                    content: text
                }
            ],
            temperature: 0.3,
            max_tokens: 1000,
        });

        const enhancedText = completion.choices[0]?.message?.content || text;

        return NextResponse.json({ enhancedText });

    } catch (error: any) {
        console.error('Error enhancing text:', error);

        // Return original text with basic formatting on error
        const { text } = await req.json();
        return NextResponse.json({
            enhancedText: text ? basicFormatText(text) : text,
            error: error.message
        });
    }
}

// Basic text formatting function as fallback
function basicFormatText(text: string): string {
    if (!text) return '';

    // Capitalize first letter
    let result = text.charAt(0).toUpperCase() + text.slice(1);

    // Add period at end if missing punctuation
    if (!result.match(/[.!?]$/)) {
        result += '.';
    }

    return result;
}