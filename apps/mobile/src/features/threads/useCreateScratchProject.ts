import { useCallback } from "react";
import { CommandId, ProjectId, type EnvironmentId } from "@t3tools/contracts";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { buildScratchProjectCreateCommand } from "@t3tools/client-runtime/operations/projects";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { projectEnvironment } from "../../state/projects";
import { waitForProject } from "../../state/entities";
import { useAtomCommand } from "../../state/use-atom-command";
import { uuidv4 } from "../../lib/uuid";

export function useCreateScratchProject() {
  const createProject = useAtomCommand(projectEnvironment.create, { reportFailure: false });
  const updateProject = useAtomCommand(projectEnvironment.update, { reportFailure: false });
  return useCallback(
    async (environmentId: EnvironmentId) => {
      const projectId = ProjectId.make(uuidv4());
      const result = await createProject({
        environmentId,
        input: buildScratchProjectCreateCommand({
          commandId: CommandId.make(uuidv4()),
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
      const project = await waitForProject(scopeProjectRef(environmentId, projectId));
      if (!project) throw new Error("The scratch workspace did not become available.");
      return project;
    },
    [createProject, updateProject],
  );
}
