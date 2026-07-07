'use strict';

/**
 * Skill memory store.
 *
 * A "skill" is a named action the user taught the assistant by demonstration.
 * Each skill is persisted as JSON on disk (in Electron's userData dir) so the
 * library survives restarts. Screenshots are kept as small data-URL thumbnails
 * inline for the MVP; a later phase can move them to a media folder.
 *
 * Shape of a skill record:
 * {
 *   id: string,               // stable unique id
 *   name: string,             // what the user called it, e.g. "file my weekly report"
 *   description: string,      // Claude's generalized summary of the demonstration
 *   steps: string[],          // human-readable step list Claude inferred
 *   trigger_phrases: string[],// natural-language ways to invoke this skill
 *   app_context: string,      // which app(s) this happens in, if known
 *   frames: string[],         // data-URL thumbnails captured during the demo
 *   note: string,             // the free-text note the user typed while naming it
 *   created_at: string        // ISO timestamp (passed in from the main process)
 * }
 */

const fs = require('fs');
const path = require('path');

class SkillStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.skills = this._load();
  }

  _load() {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      // Missing or unreadable file → start with an empty library.
      return [];
    }
  }

  _persist() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(this.skills, null, 2), 'utf8');
  }

  list() {
    // Return metadata only (no heavy frame data) for list views.
    return this.skills.map((s) => this._summary(s));
  }

  _summary(s) {
    return {
      id: s.id,
      name: s.name,
      description: s.description,
      steps: s.steps,
      trigger_phrases: s.trigger_phrases,
      app_context: s.app_context,
      note: s.note,
      created_at: s.created_at,
      frame_count: Array.isArray(s.frames) ? s.frames.length : 0,
    };
  }

  get(id) {
    return this.skills.find((s) => s.id === id) || null;
  }

  add(skill) {
    this.skills.push(skill);
    this._persist();
    return this._summary(skill);
  }

  remove(id) {
    const before = this.skills.length;
    this.skills = this.skills.filter((s) => s.id !== id);
    const changed = this.skills.length !== before;
    if (changed) this._persist();
    return changed;
  }

  /**
   * Lightweight context block handed to Claude so it knows what skills exist
   * when the user talks to the assistant. Kept text-only and compact on purpose.
   */
  contextForPrompt() {
    if (this.skills.length === 0) {
      return 'The user has not taught any skills yet. The library is empty.';
    }
    return this.skills
      .map((s, i) => {
        const triggers = (s.trigger_phrases || []).join('", "');
        const steps = (s.steps || []).map((st, j) => `      ${j + 1}. ${st}`).join('\n');
        return [
          `Skill ${i + 1} — id: ${s.id}`,
          `  name: ${s.name}`,
          `  app context: ${s.app_context || 'unknown'}`,
          `  description: ${s.description}`,
          triggers ? `  invoked by phrases like: "${triggers}"` : null,
          steps ? `  steps:\n${steps}` : null,
        ]
          .filter(Boolean)
          .join('\n');
      })
      .join('\n\n');
  }
}

module.exports = { SkillStore };
