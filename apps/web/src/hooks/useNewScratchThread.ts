import { useCallback, useRef } from "react";
import { CommandId, type EnvironmentId } from "@t3tools/contracts";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { buildScratchProjectCreateCommand } from "@t3tools/client-runtime/operations/projects";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { projectEnvironment } from "../state/projects";
import { waitForProject } from "../state/entities";
import { useAtomCommand } from "../state/use-atom-command";
import { useNewThreadHandler } from "./useHandleNewThread";
import { newProjectId, randomUUID } from "../lib/utils";

export function useNewScratchThread() {
  const createProject = useAtomCommand(projectEnvironment.create, { reportFailure: false });
  const updateProject = useAtomCommand(projectEnvironment.update, { reportFailure: false });
  const openThread = useNewThreadHandler();
  const pending = useRef<Promise<void> | null>(null);
  return useCallback(
    (environmentId: EnvironmentId): Promise<void> => {
      if (pending.current) return pending.current;
      const run = async () => {
        const projectId = newProjectId();
        const result = await createProject({
          environmentId,
          input: buildScratchProjectCreateCommand({
            commandId: CommandId.make(randomUUID()),
            projectId,
            createdAt: new Date().toISOString(),
          }),
        });
        if (result._tag === "Failure") throw squashAtomCommandFailure(result);
        const defaults = await updateProject({
          environmentId,
          input: { projectId, defaultThreadEnvMode: "local" },
        });
        if (defaults._tag === "Failure") throw squashAtomCommandFailure(defaults);
        const projectRef = scopeProjectRef(environmentId, projectId);
        await waitForProject(projectRef);
        await openThread(projectRef, {
          envMode: "local",
          branch: null,
          worktreePath: null,
          startFromOrigin: false,
        });
      };
      const operation = run().finally(() => {
        pending.current = null;
      });
      pending.current = operation;
      return operation;
    },
    [createProject, updateProject, openThread],
  );
}
