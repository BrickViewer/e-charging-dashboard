import {
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import SessionRedirect from "./wizard/SessionRedirect";
import WizardPage from "./wizard/WizardPage";

const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

const sessionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/s/$sessionId",
  component: SessionRedirect,
});

const stepRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/s/$sessionId/stap/$step",
  component: WizardPage,
});

const routeTree = rootRoute.addChildren([sessionRoute, stepRoute]);

// basepath = subpad waar de app draait (dashboard.e-charging.nl/configurator).
export const router = createRouter({ routeTree, basepath: "/configurator" });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
