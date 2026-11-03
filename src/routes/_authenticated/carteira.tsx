import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/carteira")({
  beforeLoad: () => {
    throw redirect({ to: "/prospect" });
  },
  component: () => null,
});
