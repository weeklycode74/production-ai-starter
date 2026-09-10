import { NextResponse } from 'next/server';
import { executeResilientCompletion } from '@/lib/ai-gateway';

export async function POST(req: Request) {
  try {
    const { prompt, userId } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: 'Missing prompt parameter' }, { status: 400 });
    }

    const result = await executeResilientCompletion({ prompt, userId: userId || 'anonymous' });
    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Server Error' }, { status: 500 });
  }
}