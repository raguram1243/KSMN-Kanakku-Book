// Copy bill photos and PDFs between Supabase projects through a local folder.
//
//   node storage-copy.mjs download <dir>   (reads SRC_URL, SRC_SERVICE_KEY)
//   node storage-copy.mjs upload   <dir>   (reads DST_URL, DST_SERVICE_KEY)
//   node storage-copy.mjs verify   <dir>   (reads DST_URL, DST_SERVICE_KEY)
//
// download writes every object of both buckets to <dir>/<bucket>/<path> plus
// <dir>/manifest.json (path, size, content type). upload sends them to the
// new project under the same paths. verify lists the new project and checks
// every manifest entry is there with the same size.
// Keys come from the environment only; nothing secret is written to disk.

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const BUCKETS = ['entry-photos', 'entry-docs']
const [mode, dir] = process.argv.slice(2)

if (!['download', 'upload', 'verify'].includes(mode) || !dir) {
  console.error('usage: node storage-copy.mjs download|upload|verify <dir>')
  process.exit(2)
}

function env(name) {
  const value = process.env[name]
  if (!value) {
    console.error(`missing environment variable ${name}`)
    process.exit(2)
  }
  return value.replace(/\/+$/, '')
}

function headers(key, extra = {}) {
  return { Authorization: `Bearer ${key}`, apikey: key, ...extra }
}

// Every object in a bucket, walking folders (entries with id === null).
async function listAll(base, key, bucket, prefix = '') {
  const out = []
  for (let offset = 0; ; offset += 1000) {
    const res = await fetch(`${base}/storage/v1/object/list/${bucket}`, {
      method: 'POST',
      headers: headers(key, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } }),
    })
    if (!res.ok) throw new Error(`list ${bucket}/${prefix}: ${res.status} ${await res.text()}`)
    const page = await res.json()
    for (const item of page) {
      const path = prefix ? `${prefix}/${item.name}` : item.name
      if (item.id === null) {
        out.push(...await listAll(base, key, bucket, path))
      } else {
        out.push({
          bucket,
          path,
          size: Number(item.metadata?.size ?? 0),
          contentType: item.metadata?.mimetype || 'application/octet-stream',
        })
      }
    }
    if (page.length < 1000) break
  }
  return out
}

function objectUrl(base, bucket, path) {
  return `${base}/storage/v1/object/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`
}

async function download() {
  const base = env('SRC_URL')
  const key = env('SRC_SERVICE_KEY')
  const manifest = []
  for (const bucket of BUCKETS) {
    const objects = await listAll(base, key, bucket)
    console.log(`${bucket}: ${objects.length} files`)
    for (const obj of objects) {
      const res = await fetch(objectUrl(base, bucket, obj.path), { headers: headers(key) })
      if (!res.ok) throw new Error(`download ${bucket}/${obj.path}: ${res.status}`)
      const bytes = Buffer.from(await res.arrayBuffer())
      if (obj.size && bytes.length !== obj.size) {
        throw new Error(`size mismatch on ${bucket}/${obj.path}: listed ${obj.size}, got ${bytes.length}`)
      }
      const file = join(dir, bucket, obj.path)
      await mkdir(dirname(file), { recursive: true })
      await writeFile(file, bytes)
      manifest.push({ ...obj, size: bytes.length })
    }
  }
  await writeFile(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2))
  const total = manifest.reduce((s, o) => s + o.size, 0)
  console.log(`downloaded ${manifest.length} files, ${(total / 1024 / 1024).toFixed(1)} MB -> ${dir}`)
}

async function upload() {
  const base = env('DST_URL')
  const key = env('DST_SERVICE_KEY')
  const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'))
  let done = 0
  for (const obj of manifest) {
    const bytes = await readFile(join(dir, obj.bucket, obj.path))
    const res = await fetch(objectUrl(base, obj.bucket, obj.path), {
      method: 'POST',
      headers: headers(key, { 'Content-Type': obj.contentType, 'x-upsert': 'true' }),
      body: bytes,
    })
    if (!res.ok) throw new Error(`upload ${obj.bucket}/${obj.path}: ${res.status} ${await res.text()}`)
    done += 1
    if (done % 25 === 0) console.log(`  ${done}/${manifest.length}`)
  }
  console.log(`uploaded ${done} files`)
}

async function verify() {
  const base = env('DST_URL')
  const key = env('DST_SERVICE_KEY')
  const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'))
  const present = new Map()
  for (const bucket of BUCKETS) {
    for (const obj of await listAll(base, key, bucket)) present.set(`${bucket}/${obj.path}`, obj.size)
  }
  const missing = manifest.filter((o) => present.get(`${o.bucket}/${o.path}`) !== o.size)
  if (missing.length) {
    console.error(`${missing.length} files missing or wrong size, e.g.`, missing.slice(0, 5))
    process.exit(1)
  }
  console.log(`verified: all ${manifest.length} files present with matching sizes`)
}

await { download, upload, verify }[mode]()
