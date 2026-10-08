"use client";
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>Unable to load this view</AlertTitle>
      <AlertDescription>
        The request could not complete. Check the database connection and server
        availability.
        <Button onClick={reset} variant="outline">
          Try again
        </Button>
      </AlertDescription>
    </Alert>
  );
}
