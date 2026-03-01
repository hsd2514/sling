import { useState } from "react";
import UploadPage from "./pages/UploadPage";
import ViewerPage from "./pages/ViewerPage";
import ComparePage from "./pages/ComparePage";
import DatasetPage from "./pages/DatasetPage";

export default function App() {
  const [session, setSession] = useState(null);
  const [page, setPage] = useState("home"); // home | viewer | compare | dataset

  // Navigation helper
  const goHome = () => {
    setSession(null);
    setPage("home");
  };

  if (page === "compare") {
    return <ComparePage onBack={goHome} />;
  }

  if (page === "dataset") {
    return <DatasetPage onBack={goHome} />;
  }

  if (session) {
    return (
      <ViewerPage
        session={session}
        onBack={goHome}
        onSessionReload={setSession}
      />
    );
  }

  return (
    <UploadPage
      onUploaded={(s) => {
        setSession(s);
        setPage("viewer");
      }}
      onOpenSession={(s) => {
        setSession(s);
        setPage("viewer");
      }}
      onNavigate={setPage}
    />
  );
}
