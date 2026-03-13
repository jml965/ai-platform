import { useMutation, useQueryClient } from "@tanstack/react-query";

interface UpdateFileParams {
  projectId: string;
  fileId: string;
  content: string;
}

async function updateProjectFile({ projectId, fileId, content }: UpdateFileParams) {
  const baseUrl = import.meta.env.VITE_API_URL || "";
  const res = await fetch(`${baseUrl}/api/projects/${projectId}/files/${fileId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    throw new Error(`Failed to update file: ${res.status}`);
  }
  return res.json();
}

export function useUpdateFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateProjectFile,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["listProjectFiles", variables.projectId],
      });
    },
  });
}
