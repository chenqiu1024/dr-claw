import express from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';
import multer from 'multer';
import { referencesDb } from '../database/db.js';
import { getZoteroClient } from '../utils/zotero-client.js';
import { parseBibtex } from '../utils/parsers/bibtex-parser.js';

const router = express.Router();

// Multer for BibTeX file upload (in-memory, max 5 MB)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// PDF cache directory
const PDF_CACHE_DIR = path.join(os.homedir(), '.dr-claw', 'references', 'pdfs');

function ensurePdfCacheDir() {
  if (!fs.existsSync(PDF_CACHE_DIR)) {
    fs.mkdirSync(PDF_CACHE_DIR, { recursive: true });
  }
}

// ---------------------------------------------------------------------------
// IMPORTANT: All literal/multi-segment routes MUST come before /:id
// to avoid Express matching "tags", "project", "zotero" etc. as an :id param.
// ---------------------------------------------------------------------------

/** GET /api/references — list user references (paginated, searchable) */
router.get('/', async (req, res) => {
  try {
    const { search, tags, limit, offset } = req.query;
    const parsedTags = tags ? tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined;
    const refs = referencesDb.getUserReferences(req.user.id, {
      search: search || undefined,
      tags: parsedTags,
      limit: parseInt(limit) || 50,
      offset: parseInt(offset) || 0,
    });
    res.json({ references: refs });
  } catch (error) {
    console.error('Error fetching references:', error);
    res.status(500).json({ error: 'Failed to fetch references' });
  }
});

/** GET /api/references/tags — all user tags */
router.get('/tags', async (req, res) => {
  try {
    const tags = referencesDb.getTags(req.user.id);
    res.json({ tags });
  } catch (error) {
    console.error('Error fetching tags:', error);
    res.status(500).json({ error: 'Failed to fetch tags' });
  }
});

/** GET /api/references/zotero/status — check Zotero connectivity */
router.get('/zotero/status', async (req, res) => {
  try {
    const { mode, localRunning, localApiDisabled } = await getZoteroClient();
    res.json({
      connected: mode !== null,
      mode,
      localAvailable: mode === 'local',
      localRunning,
      localApiDisabled,
    });
  } catch (error) {
    console.error('Error checking Zotero status:', error);
    res.json({ connected: false, mode: null, localAvailable: false, localRunning: false, localApiDisabled: false });
  }
});

/** GET /api/references/zotero/collections — list Zotero collections */
router.get('/zotero/collections', async (req, res) => {
  try {
    const { client, mode } = await getZoteroClient();
    if (!client) {
      return res.status(503).json({ error: 'Zotero not available' });
    }
    const libraries = await client.getLibraries();
    const collections = await client.getCollections(libraries[0]?.id);
    res.json({ collections, mode });
  } catch (error) {
    console.error('Error fetching Zotero collections:', error);
    res.status(500).json({ error: 'Failed to fetch Zotero collections' });
  }
});

/** GET /api/references/zotero/items — browse Zotero items without importing */
router.get('/zotero/items', async (req, res) => {
  try {
    const { client } = await getZoteroClient();
    if (!client) {
      return res.status(503).json({ error: 'Zotero not available' });
    }
    const { collectionKey, limit, start } = req.query;
    if (collectionKey && !/^[A-Za-z0-9]+$/.test(collectionKey)) {
      return res.status(400).json({ error: 'Invalid collectionKey format' });
    }
    const libraries = await client.getLibraries();
    const libraryId = libraries[0]?.id;
    const items = await client.getItems(libraryId, {
      collectionKey: collectionKey || undefined,
      limit: parseInt(limit) || 100,
      start: parseInt(start) || 0,
    });
    // Strip rawData before sending to client
    const mapped = items.map(({ rawData, ...rest }) => rest);
    res.json({ items: mapped });
  } catch (error) {
    console.error('Error browsing Zotero items:', error);
    res.status(500).json({ error: 'Failed to browse Zotero items' });
  }
});

/** POST /api/references/sync/zotero — sync from Zotero */
router.post('/sync/zotero', async (req, res) => {
  try {
    const { client, mode, localApiDisabled } = await getZoteroClient();
    if (!client) {
      const error = localApiDisabled
        ? 'Zotero is running but the local API is disabled. Enable it in Zotero → Settings → Advanced → Allow other applications to communicate with Zotero.'
        : 'Zotero desktop is not running. Start the Zotero app and try again.';
      return res.status(503).json({ error });
    }

    const { collectionKey, projectName, sourceIds } = req.body || {};
    if (collectionKey && !/^[A-Za-z0-9]+$/.test(collectionKey)) {
      return res.status(400).json({ error: 'Invalid collectionKey format' });
    }
    const libraries = await client.getLibraries();
    const libraryId = libraries[0]?.id;

    // Fetch all items (paginated)
    let allItems = [];
    let start = 0;
    const pageSize = 100;
    while (true) {
      const batch = await client.getItems(libraryId, { collectionKey, limit: pageSize, start });
      allItems.push(...batch);
      if (batch.length < pageSize) break;
      start += pageSize;
    }

    // Filter by sourceIds if provided (selective import)
    if (sourceIds?.length > 0) {
      const allowed = new Set(sourceIds);
      allItems = allItems.filter(item => allowed.has(item.sourceId));
    }

    const ids = referencesDb.syncFromZotero(req.user.id, allItems);
    let linked = 0;
    if (projectName && ids.length > 0) {
      linked = referencesDb.bulkLinkIds(projectName, ids);
    }
    res.json({ success: true, synced: ids.length, linked, mode, total: allItems.length });
  } catch (error) {
    console.error('Error syncing Zotero:', error);
    const msg = error.message || 'Unknown error';
    if (msg.includes('ECONNREFUSED')) {
      return res.status(503).json({ error: 'Cannot connect to Zotero desktop. Is it running?' });
    }
    if (error.name === 'AbortError' || msg.includes('timeout')) {
      return res.status(504).json({ error: 'Zotero connection timed out.' });
    }
    if (msg.includes('Zotero API')) {
      return res.status(502).json({ error: msg });
    }
    res.status(500).json({ error: `Sync failed: ${msg}` });
  }
});

/** POST /api/references/import/bibtex — import BibTeX file */
router.post('/import/bibtex', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }
    const content = req.file.buffer.toString('utf-8');
    const entries = parseBibtex(content);
    if (entries.length === 0) {
      return res.status(400).json({ error: 'No valid BibTeX entries found' });
    }
    const ids = referencesDb.importReferences(req.user.id, entries, 'bibtex');
    const projectName = req.body?.projectName;
    let linked = 0;
    if (projectName && ids.length > 0) {
      linked = referencesDb.bulkLinkIds(projectName, ids);
    }
    res.json({ success: true, imported: ids.length, linked, total: entries.length });
  } catch (error) {
    console.error('Error importing BibTeX:', error);
    const msg = error.message || 'Unknown error';
    res.status(500).json({ error: `Import failed: ${msg}` });
  }
});

// ---------------------------------------------------------------------------
// Project ↔ Reference linking (multi-segment — must come before /:id)
// ---------------------------------------------------------------------------

/** GET /api/references/project/:projectName — references linked to a project */
router.get('/project/:projectName', async (req, res) => {
  try {
    const refs = referencesDb.getProjectReferences(req.params.projectName, req.user.id);
    res.json({ references: refs });
  } catch (error) {
    console.error('Error fetching project references:', error);
    res.status(500).json({ error: 'Failed to fetch project references' });
  }
});

/** POST /api/references/project/:projectName/:id — link reference to project */
router.post('/project/:projectName/:id', async (req, res) => {
  try {
    const linked = referencesDb.linkToProject(req.params.projectName, req.params.id, req.user.id);
    if (!linked) {
      return res.status(404).json({ error: 'Reference not found' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error linking reference:', error);
    res.status(500).json({ error: 'Failed to link reference to project' });
  }
});

/** DELETE /api/references/project/:projectName/:id — unlink reference from project */
router.delete('/project/:projectName/:id', async (req, res) => {
  try {
    const removed = referencesDb.unlinkFromProject(req.params.projectName, req.params.id, req.user.id);
    if (!removed) {
      return res.status(404).json({ error: 'Link not found' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error unlinking reference:', error);
    res.status(500).json({ error: 'Failed to unlink reference from project' });
  }
});

// ---------------------------------------------------------------------------
// Single-item routes (parameterized — must come LAST)
// ---------------------------------------------------------------------------

/** POST /api/references/bulk-delete — delete multiple references */
router.post('/bulk-delete', async (req, res) => {
  try {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array is required' });
    }
    if (ids.length > 500) {
      return res.status(400).json({ error: 'Cannot delete more than 500 references at once' });
    }
    const deleted = referencesDb.bulkDeleteReferences(req.user.id, ids);
    res.json({ success: true, deleted });
  } catch (error) {
    console.error('Error bulk-deleting references:', error);
    res.status(500).json({ error: 'Failed to delete references' });
  }
});

/** GET /api/references/:id/pdf — serve cached or fetch PDF */
router.get('/:id/pdf', async (req, res) => {
  try {
    ensurePdfCacheDir();
    const ref = referencesDb.getReference(req.params.id, req.user.id);
    if (!ref) {
      return res.status(404).json({ error: 'Reference not found' });
    }

    // Sanitize ID for filesystem path and verify no traversal
    const safeId = ref.id.replace(/[^a-zA-Z0-9_\-]/g, '_');
    const pdfPath = path.join(PDF_CACHE_DIR, `${safeId}.pdf`);
    const resolvedPath = path.resolve(pdfPath);
    if (!resolvedPath.startsWith(path.resolve(PDF_CACHE_DIR))) {
      return res.status(400).json({ error: 'Invalid reference ID' });
    }

    // Serve from cache if available
    if (fs.existsSync(pdfPath)) {
      res.setHeader('Content-Type', 'application/pdf');
      return fs.createReadStream(pdfPath).pipe(res);
    }

    // Try to fetch from Zotero
    if (ref.source === 'zotero' && ref.source_id) {
      const { client } = await getZoteroClient();
      if (client) {
        const libraries = await client.getLibraries();
        const pdfBuffer = await client.getItemPdf(libraries[0]?.id, ref.source_id);
        if (pdfBuffer) {
          fs.writeFileSync(pdfPath, pdfBuffer);
          referencesDb.setPdfCached(ref.id, true);
          res.setHeader('Content-Type', 'application/pdf');
          return res.send(pdfBuffer);
        }
      }
    }

    res.status(404).json({ error: 'PDF not available' });
  } catch (error) {
    console.error('Error fetching PDF:', error);
    res.status(500).json({ error: 'Failed to fetch PDF' });
  }
});

/** GET /api/references/:id — single reference detail */
router.get('/:id', async (req, res) => {
  try {
    const ref = referencesDb.getReference(req.params.id, req.user.id);
    if (!ref) {
      return res.status(404).json({ error: 'Reference not found' });
    }
    res.json({ reference: ref });
  } catch (error) {
    console.error('Error fetching reference:', error);
    res.status(500).json({ error: 'Failed to fetch reference' });
  }
});

/** DELETE /api/references/:id — delete a reference */
router.delete('/:id', async (req, res) => {
  try {
    const deleted = referencesDb.deleteReference(req.user.id, req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Reference not found' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting reference:', error);
    res.status(500).json({ error: 'Failed to delete reference' });
  }
});

export default router;
