"use client";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="state-block" role="alert">
      <span className="state-icon tone-danger">
        <TriangleAlert size={18} aria-hidden="true" />
      </span>
      <h2>Unable to load this view</h2>
      <p>
        The request could not complete. Check the database connection and server
        availability.
      </p>
      <div className="state-action">
        <Button onClick={reset} variant="outline" size="lg">
          Try again
        </Button>
      </div>
    </div>
  );
}
