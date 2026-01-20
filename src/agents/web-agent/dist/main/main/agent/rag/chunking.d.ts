import { ContentChunk, PageContent, Section, Heading, DOMComponent } from '../../../shared/types';
export declare function chunkContent(pageContent: PageContent, components?: DOMComponent[]): ContentChunk[];
export declare function extractStructure(htmlContent: string, textContent: string): {
    sections: Section[];
    headings: Heading[];
};
//# sourceMappingURL=chunking.d.ts.map