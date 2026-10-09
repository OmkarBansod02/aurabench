import Link from "next/link";
import { SearchX } from "lucide-react";
import { EmptyState } from "@/components/common";
import { Button } from "@/components/ui/button";
export default function NotFound() {
  return (
    <EmptyState
      title="Execution or regression not found"
      icon={<SearchX size={18} aria-hidden="true" />}
      action={
        <Button asChild variant="outline" size="lg">
          <Link href="/">Return to the run lab</Link>
        </Button>
      }
    >
      <p>
        This record does not exist, or this execution is not a regression
        candidate.
      </p>
    </EmptyState>
  );
}
