// Saved projects. Firestore when signed in through Firebase, otherwise browser storage (demo mode).
//   users/{uid}/projects/{id}     name, updated, created, count, thumb   (small, listed on the dashboard)
//   users/{uid}/projectData/{id}  data (the plan as JSON text)

import { auth } from './auth.js';
import { uid } from './util.js';

const lsKey = (u) => 'venuely.demo.projects.' + u;
const lsRead = (u) => { try { return JSON.parse(localStorage.getItem(lsKey(u))) || []; } catch (e) { return []; } };
const lsWrite = (u, list) => { try { localStorage.setItem(lsKey(u), JSON.stringify(list)); } catch (e) { throw new Error('This browser is out of storage space. Delete some projects and try again.'); } };

function need() { if (!auth.user) throw new Error('Not signed in'); return auth.user.uid; }
const fs = () => auth.fb.F;

export const cloud = {
  /** @returns {Promise<{id,name,updated,created,count,thumb}[]>} newest first */
  async list() {
    const u = need();
    let rows;
    if (auth.backend === 'firebase') {
      const { F, db } = auth.fb;
      const snap = await F.getDocs(F.collection(db, 'users', u, 'projects'));
      rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } else rows = lsRead(u).map(({ data, ...m }) => m);
    return rows.sort((a, b) => (b.updated || 0) - (a.updated || 0));
  },

  async get(id) {
    const u = need();
    if (auth.backend === 'firebase') {
      const { F, db } = auth.fb;
      const [m, d] = await Promise.all([F.getDoc(F.doc(db, 'users', u, 'projects', id)), F.getDoc(F.doc(db, 'users', u, 'projectData', id))]);
      if (!m.exists() || !d.exists()) return null;
      return { id, ...m.data(), data: d.data().data };
    }
    return lsRead(u).find((p) => p.id === id) || null;
  },

  /** Create or update. `p` = {id, name, data, count, thumb?}. */
  async save(p) {
    const u = need(), now = Date.now();
    if (auth.backend === 'firebase') {
      const { F, db } = auth.fb;
      const meta = { name: p.name, updated: now, count: p.count || 0 };
      if (p.thumb !== undefined) meta.thumb = p.thumb;
      const ref = F.doc(db, 'users', u, 'projects', p.id);
      const existing = await F.getDoc(ref);
      if (!existing.exists()) meta.created = now;
      const batch = F.writeBatch(db);
      batch.set(ref, meta, { merge: true });
      batch.set(F.doc(db, 'users', u, 'projectData', p.id), { data: p.data });
      await batch.commit();
      return { id: p.id, updated: now };
    }
    const list = lsRead(u);
    const i = list.findIndex((x) => x.id === p.id);
    const rec = { ...(i >= 0 ? list[i] : { created: now }), id: p.id, name: p.name, data: p.data, count: p.count || 0, updated: now };
    if (p.thumb !== undefined) rec.thumb = p.thumb;
    if (i >= 0) list[i] = rec; else list.push(rec);
    lsWrite(u, list);
    return { id: p.id, updated: now };
  },

  async remove(id) {
    const u = need();
    if (auth.backend === 'firebase') {
      const { F, db } = auth.fb;
      const batch = F.writeBatch(db);
      batch.delete(F.doc(db, 'users', u, 'projects', id));
      batch.delete(F.doc(db, 'users', u, 'projectData', id));
      await batch.commit();
      return;
    }
    lsWrite(u, lsRead(u).filter((p) => p.id !== id));
  },

  async rename(id, name) {
    const p = await this.get(id);
    if (!p) return;
    const d = JSON.parse(p.data);
    d.meta = { ...d.meta, name };
    await this.save({ id, name, data: JSON.stringify(d), count: p.count });
  },

  async duplicate(id) {
    const p = await this.get(id);
    if (!p) return null;
    const nid = uid() + uid();
    const d = JSON.parse(p.data);
    d.meta = { ...d.meta, name: `${p.name} copy`, projectId: nid };
    await this.save({ id: nid, name: `${p.name} copy`, data: JSON.stringify(d), count: p.count, thumb: p.thumb });
    return nid;
  },
};
