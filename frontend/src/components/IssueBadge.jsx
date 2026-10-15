import { AlertCircle, AlertTriangle, CheckCircle2, ShieldCheck } from "lucide-react";
import { getIssueType } from "../utils/issueHelpers";
export default function IssueBadge({ transaction }) {
  const issue = getIssueType(transaction);
  const className = issue === "Critical" ? "issue-critical" : ["Warning", "Review"].includes(issue) ? "issue-warning" : "issue-none";
  return <span className={`issue-label ${className}`}>
    {issue === "Critical" && <AlertCircle size={14} />}
    {issue === "Warning" && <AlertTriangle size={14} />}
    {issue === "Review" && <ShieldCheck size={14} />}
    {issue === "None" && <CheckCircle2 size={14} />}
    {issue}
  </span>;
}
