// Multipart-upload the basemap to the public-read "maps" bucket on the Railway MinIO (S3 SigV4, path style).
// Usage: S3_ENDPOINT=... S3_ACCESS=... S3_SECRET=... node scripts/upload-basemap.mjs apps/web/public/maps/sri-lanka.pmtiles
// The "maps" bucket must exist with a public s3:GetObject policy (see docs/deploy-railway-vercel.md).
import { createHash, createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';

const endpoint = new URL(process.env.S3_ENDPOINT);
const access = process.env.S3_ACCESS;
const secret = process.env.S3_SECRET;
const region = 'us-east-1';
const file = process.argv[2];

const hmac = (k, s) => createHmac('sha256', k).update(s).digest();
const sha = (b) => createHash('sha256').update(b).digest('hex');

// query: already-encoded, keys sorted
async function s3(method, path, query = '', body = Buffer.alloc(0), headers = {}) {
  const now = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = now.slice(0, 8);
  const payloadHash = sha(body);
  const h = { host: endpoint.host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': now, ...headers };
  const names = Object.keys(h).sort();
  const canonHeaders = names.map((n) => `${n}:${String(h[n]).trim()}\n`).join('');
  const signed = names.join(';');
  const canon = [method, path, query, canonHeaders, signed, payloadHash].join('\n');
  const scope = `${date}/${region}/s3/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', now, scope, sha(canon)].join('\n');
  const key = hmac(hmac(hmac(hmac(`AWS4${secret}`, date), region), 's3'), 'aws4_request');
  const sig = createHmac('sha256', key).update(toSign).digest('hex');
  const send = { ...h, authorization: `AWS4-HMAC-SHA256 Credential=${access}/${scope}, SignedHeaders=${signed}, Signature=${sig}` };
  delete send.host;
  const res = await fetch(`${endpoint.origin}${path}${query ? `?${query}` : ''}`, {
    method,
    headers: send,
    body: body.length ? body : undefined,
  });
  return { status: res.status, etag: res.headers.get('etag'), text: await res.text() };
}

const key = '/maps/sri-lanka.pmtiles';
const body = readFileSync(file);

let r = await s3('POST', key, 'uploads=', Buffer.alloc(0), { 'content-type': 'application/octet-stream' });
const uploadId = /<UploadId>([^<]+)</.exec(r.text)?.[1];
if (!uploadId) throw new Error(`initiate failed ${r.status} ${r.text.slice(0, 200)}`);
const enc = encodeURIComponent(uploadId);

const PART = 20 * 1024 * 1024;
const etags = [];
for (let n = 1, off = 0; off < body.length; n++, off += PART) {
  for (let attempt = 1; ; attempt++) {
    r = await s3('PUT', key, `partNumber=${n}&uploadId=${enc}`, body.subarray(off, off + PART));
    if (r.status === 200) break;
    if (attempt === 3) throw new Error(`part ${n} failed ${r.status} ${r.text.slice(0, 120)}`);
  }
  etags.push(r.etag);
  console.log(`part ${n} ok`);
}

const xml = Buffer.from(
  `<CompleteMultipartUpload>${etags
    .map((e, i) => `<Part><PartNumber>${i + 1}</PartNumber><ETag>${e}</ETag></Part>`)
    .join('')}</CompleteMultipartUpload>`,
);
r = await s3('POST', key, `uploadId=${enc}`, xml, { 'content-type': 'application/xml' });
console.log('complete', r.status, r.status === 200 ? '' : r.text.slice(0, 200));
