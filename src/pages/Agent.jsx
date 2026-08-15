import LaborIdeasPage from "./Agents";

function Agent({ userDocId, onOpenReleases, onOpenSettings }) {
  return (
    <LaborIdeasPage
      userDocId={userDocId}
      experience="agent"
      onOpenReleases={onOpenReleases}
      onOpenSettings={onOpenSettings}
    />
  );
}

export default Agent;
