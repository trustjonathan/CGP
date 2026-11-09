export interface DocumentPageReference {
  clause: string;
  page: number;
}

export interface UniversityDocument {
  id: string;
  title: string;
  file: string;
  versionLabel: string;
  officialUrl: string;
  note: string;
  pageReferences: DocumentPageReference[];
}

export const documentsConfig: {
  bundlePdfs: boolean;
  documents: UniversityDocument[];
} = {
  bundlePdfs: false,
  documents: [
    {
      id: 'students-handbook',
      title: 'Kabale University Students Handbook, April 2015',
      file: 'documents/kabale-university-students-handbook-2015.pdf',
      versionLabel: 'April 2015',
      officialUrl: 'https://www.kab.ac.ug/download/students-handbook/',
      note: 'Student guidance and university procedures.',
      pageReferences: [],
    },
    {
      id: 'examinations-policy',
      title: 'Kabale University Examinations Policy, March 2026',
      file: 'documents/kabale-university-examinations-policy-2026.pdf',
      versionLabel: 'March 2026',
      officialUrl: 'https://www.kab.ac.ug/download/academic-policy-and-examination-regulations/',
      note: 'Rules for examinations and assessment.',
      pageReferences: [],
    },
  ],
};
