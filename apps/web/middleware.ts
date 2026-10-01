import { NextRequest, NextResponse } from 'next/server';

// Cookie presence check only; the API validates the session itself.
export function middleware(req: NextRequest) {
  if (!req.cookies.has('ws_session')) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next|favicon.ico|manifest.json|maps|icons|login|no-access|landing).+)'],
};
