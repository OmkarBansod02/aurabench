import { EmptyState, TextLink } from "@/components/common";
export default function NotFound() {
  return (
    <EmptyState title="Execution or regression not found">
      This record does not exist, or this execution is not a regression
      candidate. <TextLink href="/">Return to the run lab</TextLink>
    </EmptyState>
  );
}
