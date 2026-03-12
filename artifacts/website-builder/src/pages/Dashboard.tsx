import React, { useState } from "react";
import { Link } from "wouter";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, LayoutTemplate, Trash2, Loader2, Coins, LogOut, CreditCard, Users, ShieldCheck, Activity } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { LanguageToggle } from "@/components/LanguageToggle";
import type { Project, ProjectStatus as ProjectStatusType } from "@workspace/api-client-react";
import { 
  useListProjects, 
  useCreateProject, 
  useDeleteProject, 
  useGetTokenSummary,
  useAuthLogout
} from "@workspace/api-client-react";

export default function Dashboard() {
  const { t } = useI18n();
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const { data: projectsData, isLoading: loadingProjects, refetch } = useListProjects();
  const { data: tokenSummary } = useGetTokenSummary();
  const logout = useAuthLogout();

  const handleLogout = async () => {
    await logout.mutateAsync();
    window.location.href = "/";
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="h-16 border-b border-white/10 bg-card/50 backdrop-blur-md sticky top-0 z-40 px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary/20 rounded-lg flex items-center justify-center">
            <LayoutTemplate className="w-4 h-4 text-primary" />
          </div>
          <h1 className="font-bold text-lg">{t.dashboard}</h1>
        </div>

        <div className="flex items-center gap-4">
          {tokenSummary && (
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary/50 border border-white/5">
              <Coins className="w-4 h-4 text-yellow-500" />
              <span className="text-sm font-medium">{tokenSummary.monthTokens.toLocaleString()} {t.tokens}</span>
            </div>
          )}
          <Link href="/teams" className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-sm text-muted-foreground hover:text-foreground hover:border-white/20 transition-all">
            <Users className="w-4 h-4" />
            {t.team_management}
          </Link>
          <Link href="/qa" className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-sm text-muted-foreground hover:text-foreground hover:border-white/20 transition-all">
            <ShieldCheck className="w-4 h-4" />
            {t.qa_title}
          </Link>
          <Link href="/monitoring" className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-sm text-muted-foreground hover:text-foreground hover:border-white/20 transition-all">
            <Activity className="w-4 h-4" />
            {t.monitoring}
          </Link>
          <Link href="/billing" className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-sm text-muted-foreground hover:text-foreground hover:border-white/20 transition-all">
            <CreditCard className="w-4 h-4" />
            {t.billing}
          </Link>
          <LanguageToggle />
          <button onClick={handleLogout} className="p-2 text-muted-foreground hover:text-destructive transition-colors rounded-lg hover:bg-destructive/10" title={t.logout}>
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 lg:p-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
          <h2 className="text-2xl font-bold">{t.projects}</h2>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-xl font-medium shadow-lg shadow-primary/20 transition-all hover:-translate-y-0.5 active:translate-y-0"
          >
            <Plus className="w-4 h-4" />
            {t.new_project}
          </button>
        </div>

        {loadingProjects ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : projectsData?.data?.length === 0 ? (
          <div className="text-center py-20 bg-card/30 rounded-3xl border border-white/5 border-dashed">
            <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center mx-auto mb-4">
              <LayoutTemplate className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground mb-6">{t.no_projects}</p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="text-primary font-medium hover:underline"
            >
              + {t.new_project}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <AnimatePresence>
              {projectsData?.data?.map((project) => (
                <ProjectCard key={project.id} project={project} refetch={refetch} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </main>

      <CreateProjectModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSuccess={refetch} 
      />
    </div>
  );
}

function ProjectCard({ project, refetch }: { project: Project, refetch: () => void }) {
  const { t } = useI18n();
  const deleteMut = useDeleteProject();

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm(t.confirm_delete)) {
      await deleteMut.mutateAsync({ projectId: project.id });
      refetch();
    }
  };

  const statusColors = {
    draft: "bg-secondary text-secondary-foreground",
    building: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    ready: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    failed: "bg-destructive/20 text-destructive-foreground border-destructive/30"
  };

  const statusKey = `status_${project.status}` as keyof typeof t;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      whileHover={{ y: -4 }}
      className="group bg-card border border-white/10 rounded-2xl p-5 hover:shadow-xl hover:shadow-black/50 hover:border-primary/30 transition-all duration-300 relative flex flex-col"
    >
      <div className="flex justify-between items-start mb-4">
        <h3 className="font-semibold text-lg line-clamp-1 group-hover:text-primary transition-colors">
          {project.name}
        </h3>
        <button 
          onClick={handleDelete}
          className="p-1.5 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all rounded-md hover:bg-destructive/10"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      
      <p className="text-sm text-muted-foreground line-clamp-2 mb-6 flex-1">
        {project.description || "—"}
      </p>

      <div className="flex items-center justify-between mt-auto pt-4 border-t border-white/5">
        <div className={`px-2.5 py-1 rounded-md text-xs font-medium border ${statusColors[project.status as keyof typeof statusColors] || statusColors.draft}`}>
          {t[statusKey] || project.status}
        </div>
        <Link 
          href={`/project/${project.id}`}
          className="text-sm font-medium text-primary hover:underline flex items-center gap-1"
        >
          {t.view}
        </Link>
      </div>
    </motion.div>
  );
}

function CreateProjectModal({ isOpen, onClose, onSuccess }: { isOpen: boolean, onClose: () => void, onSuccess: () => void }) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const createMut = useCreateProject();

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await createMut.mutateAsync({ data: { name, description } });
      setName("");
      setDescription("");
      onSuccess();
      onClose();
    } catch (error) {
      console.error("Failed to create project", error);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-card border border-white/10 shadow-2xl rounded-2xl p-6 w-full max-w-md"
      >
        <h2 className="text-xl font-bold mb-4">{t.new_project}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">{t.project_name}</label>
            <input 
              autoFocus
              type="text" 
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-4 py-2.5 bg-background border border-white/10 rounded-xl focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">{t.project_desc}</label>
            <textarea 
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full px-4 py-2.5 bg-background border border-white/10 rounded-xl focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all resize-none h-24"
            />
          </div>
          <div className="flex gap-3 pt-2 justify-end">
            <button 
              type="button" 
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-muted-foreground hover:bg-secondary transition-colors"
            >
              {t.cancel}
            </button>
            <button 
              type="submit"
              disabled={createMut.isPending || !name.trim()}
              className="bg-primary text-primary-foreground px-6 py-2 rounded-xl font-medium shadow-lg hover:bg-primary/90 disabled:opacity-50 transition-all flex items-center gap-2"
            >
              {createMut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {createMut.isPending ? t.creating : t.create}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
