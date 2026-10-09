import { NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME } from '@/lib/serverAuth';

export async function POST() {
  const response = NextResponse.json({ success: true });
  
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: '',
    httpOnly: true,
    expires: new Date(0),
    path: '/',
  });

  response.cookies.set({
    name: 'medattend_auth',
    value: '',
    httpOnly: false,
    expires: new Date(0),
    path: '/',
  });

  return response;
}
