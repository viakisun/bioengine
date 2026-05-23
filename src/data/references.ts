// Academic references — the literature backbone of our growth models.
//
// Cited in the ModeLobby's REFERENCES section, the StatusBar of every
// non-lobby mode, and the Inspector panel's Cultivar section so the
// user always knows where each model came from.
//
// New references should be appended; existing ids are stable identifiers
// referenced elsewhere in the codebase.

export interface AcademicReference {
  id: string;
  cite: string;          // short formal citation
  topic: string;         // 1-line topic the reference covers
  url?: string;          // optional DOI / open-access link
}

export const ACADEMIC_REFERENCES: AcademicReference[] = [
  {
    id: 'tomsim',
    cite: 'Heuvelink E. 1996. TOMSIM. Ann. Bot. 77:71–80',
    topic: 'Carbon balance + dry matter partitioning',
    url: 'https://academic.oup.com/aob/article/77/1/71/2587391',
  },
  {
    id: 'tomgro',
    cite: 'Jones J.W., Kenig A., Vallejos C.E. 1999. Reduced TOMGRO. Trans. ASAE 42:255–265',
    topic: '5-state {N, LAI, W, W_f, W_m} reduced model',
    url: 'https://elibrary.asabe.org/abstract.asp?aid=13134',
  },
  {
    id: 'gillaspy',
    cite: 'Gillaspy G., Ben-David H., Gruissem W. 1993. Plant Cell 5:1439–1451',
    topic: '3-phase fruit growth (cell division → expansion → ripening)',
    url: 'https://doi.org/10.1105/tpc.5.10.1439',
  },
  {
    id: 'marcelis',
    cite: 'Marcelis L.F.M. 1996. Sink strength. Physiol. Plant. 94:447–456',
    topic: 'Per-organ sink strength + abortion under assimilate competition',
    url: 'https://doi.org/10.1111/j.1399-3054.1996.tb05521.x',
  },
];

/** Build the short status-bar label for the academic backbone. */
export const MODEL_BACKBONE_LABEL = 'TOMSIM / Reduced TOMGRO / Gillaspy 3-phase';
