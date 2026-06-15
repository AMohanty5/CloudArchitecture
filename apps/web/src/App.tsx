import { Route, Routes } from 'react-router-dom';
import { ArchitectureList } from './pages/ArchitectureList';
import { Editor } from './pages/Editor';
import { ProposalReview } from './pages/ProposalReview';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<ArchitectureList />} />
      <Route path="/architectures/:id" element={<Editor />} />
      <Route path="/ai/proposal/:jobId" element={<ProposalReview />} />
    </Routes>
  );
}
