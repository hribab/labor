import LaborIdeasPage from "./Agents";

function Evolver({ userDocId, onOpenSettings }) {
  return (
    <LaborIdeasPage
      userDocId={userDocId}
      experience="evolver"
      onOpenSettings={onOpenSettings}
    />
  );
}

export default Evolver;
