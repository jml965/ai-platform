import React, { useState } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, Plus, Trash2, Shield, UserPlus, ChevronRight,
  Loader2, LayoutTemplate, LogOut, ArrowLeft, Mail,
  Crown, Eye, Code, Search, UserMinus, ChevronDown,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { LanguageToggle } from "@/components/LanguageToggle";
import {
  useListTeams,
  useCreateTeam,
  useDeleteTeam,
  useListTeamMembers,
  useInviteTeamMember,
  useUpdateTeamMemberRole,
  useRemoveTeamMember,
  useAuthLogout,
} from "@workspace/api-client-react";

type Role = "admin" | "developer" | "reviewer" | "viewer";

const ROLE_ICONS: Record<Role, React.ReactNode> = {
  admin: <Crown className="w-4 h-4" />,
  developer: <Code className="w-4 h-4" />,
  reviewer: <Search className="w-4 h-4" />,
  viewer: <Eye className="w-4 h-4" />,
};

const ROLE_COLORS: Record<Role, string> = {
  admin: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  developer: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  reviewer: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  viewer: "bg-gray-500/10 text-gray-400 border-gray-500/30",
};

export default function Teams() {
  const { t, lang } = useI18n();
  const logout = useAuthLogout();

  const { data: teamsData, isLoading: loadingTeams, refetch: refetchTeams } = useListTeams();
  const createTeamMut = useCreateTeam();
  const deleteTeamMut = useDeleteTeam();

  const [showCreate, setShowCreate] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);

  const handleLogout = async () => {
    await logout.mutateAsync();
    window.location.href = "/";
  };

  const handleCreateTeam = async () => {
    if (!teamName.trim()) return;
    try {
      await createTeamMut.mutateAsync({ data: { name: teamName.trim() } });
      setTeamName("");
      setShowCreate(false);
      await refetchTeams();
    } catch {}
  };

  const handleDeleteTeam = async (teamId: string) => {
    if (!confirm(t.team_delete_confirm)) return;
    try {
      await deleteTeamMut.mutateAsync({ teamId });
      if (selectedTeamId === teamId) setSelectedTeamId(null);
      await refetchTeams();
    } catch {}
  };

  const teams = teamsData?.data ?? [];

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white" dir={lang === "ar" ? "rtl" : "ltr"}>
      <header className="border-b border-white/10 bg-[#0a0a0f]/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="flex items-center gap-2 text-white/60 hover:text-white transition-colors">
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm">{t.back}</span>
            </Link>
            <div className="h-6 w-px bg-white/10" />
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-violet-400" />
              <h1 className="text-lg font-semibold">{t.team_management}</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/billing" className="text-sm text-white/60 hover:text-white transition-colors">
              {t.billing}
            </Link>
            <LanguageToggle />
            <button onClick={handleLogout} className="p-2 text-white/40 hover:text-white/80 transition-colors">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold">{t.team_management}</h2>
            <p className="text-white/50 text-sm mt-1">
              {teams.length > 0 ? `${teams.length} ${t.team_members.toLowerCase()}` : ""}
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-500 rounded-xl text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            {t.team_create}
          </button>
        </div>

        <AnimatePresence>
          {showCreate && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-6 p-5 bg-white/5 border border-white/10 rounded-2xl"
            >
              <h3 className="text-lg font-semibold mb-4">{t.team_create}</h3>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder={t.team_name_placeholder}
                  className="flex-1 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                  onKeyDown={(e) => e.key === "Enter" && handleCreateTeam()}
                />
                <button
                  onClick={handleCreateTeam}
                  disabled={!teamName.trim() || createTeamMut.isPending}
                  className="px-5 py-2.5 bg-violet-600 hover:bg-violet-500 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {createTeamMut.isPending ? t.team_creating : t.create}
                </button>
                <button
                  onClick={() => { setShowCreate(false); setTeamName(""); }}
                  className="px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm transition-colors"
                >
                  {t.cancel}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {loadingTeams ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-violet-400" />
          </div>
        ) : teams.length === 0 ? (
          <div className="text-center py-20 text-white/40">
            <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>{t.team_no_teams}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {teams.map((team: any) => (
              <TeamCard
                key={team.id}
                team={team}
                isSelected={selectedTeamId === team.id}
                onSelect={() => setSelectedTeamId(selectedTeamId === team.id ? null : team.id)}
                onDelete={() => handleDeleteTeam(team.id)}
                t={t}
                lang={lang}
              />
            ))}
          </div>
        )}

        <div className="mt-12 p-6 bg-white/5 border border-white/10 rounded-2xl">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5 text-violet-400" />
            {lang === "ar" ? "الأدوار والصلاحيات" : "Roles & Permissions"}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(["admin", "developer", "reviewer", "viewer"] as Role[]).map((role) => (
              <div key={role} className={`p-4 rounded-xl border ${ROLE_COLORS[role]}`}>
                <div className="flex items-center gap-2 mb-2">
                  {ROLE_ICONS[role]}
                  <span className="font-medium">
                    {t[`team_role_${role}` as keyof typeof t]}
                  </span>
                </div>
                <p className="text-xs opacity-70">
                  {t[`team_role_desc_${role}` as keyof typeof t]}
                </p>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

function TeamCard({
  team,
  isSelected,
  onSelect,
  onDelete,
  t,
  lang,
}: {
  team: any;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  t: any;
  lang: string;
}) {
  return (
    <motion.div
      layout
      className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden"
    >
      <div
        className="p-5 flex items-center justify-between cursor-pointer hover:bg-white/[0.02] transition-colors"
        onClick={onSelect}
      >
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-violet-500/20 rounded-xl flex items-center justify-center">
            <Users className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h3 className="font-semibold">{team.name}</h3>
            <p className="text-sm text-white/40">
              {team.memberCount ?? 0} {t.team_members.toLowerCase()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-2 text-white/30 hover:text-red-400 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <ChevronDown
            className={`w-5 h-5 text-white/30 transition-transform ${isSelected ? "rotate-180" : ""}`}
          />
        </div>
      </div>

      <AnimatePresence>
        {isSelected && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <TeamDetails teamId={team.id} ownerId={team.ownerId} t={t} lang={lang} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function TeamDetails({
  teamId,
  ownerId,
  t,
  lang,
}: {
  teamId: string;
  ownerId: string;
  t: any;
  lang: string;
}) {
  const { data: membersData, isLoading, refetch } = useListTeamMembers(teamId);
  const inviteMut = useInviteTeamMember();
  const updateRoleMut = useUpdateTeamMemberRole();
  const removeMut = useRemoveTeamMember();

  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("developer");
  const [inviteSuccess, setInviteSuccess] = useState(false);

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    try {
      await inviteMut.mutateAsync({
        teamId,
        data: { email: inviteEmail.trim(), role: inviteRole },
      });
      setInviteEmail("");
      setInviteSuccess(true);
      setTimeout(() => setInviteSuccess(false), 3000);
    } catch {}
  };

  const handleRoleChange = async (userId: string, newRole: Role) => {
    try {
      await updateRoleMut.mutateAsync({
        teamId,
        userId,
        data: { role: newRole },
      });
      await refetch();
    } catch {}
  };

  const handleRemove = async (userId: string) => {
    if (!confirm(t.team_remove_confirm)) return;
    try {
      await removeMut.mutateAsync({ teamId, userId });
      await refetch();
    } catch {}
  };

  const members = membersData?.data ?? [];

  return (
    <div className="border-t border-white/10 p-5">
      <div className="flex items-center justify-between mb-4">
        <h4 className="font-medium text-white/80">{t.team_members}</h4>
        <button
          onClick={() => setShowInvite(!showInvite)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600/20 hover:bg-violet-600/30 text-violet-400 rounded-lg text-sm transition-colors"
        >
          <UserPlus className="w-3.5 h-3.5" />
          {t.team_invite}
        </button>
      </div>

      <AnimatePresence>
        {showInvite && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className="mb-4 p-4 bg-white/5 rounded-xl border border-white/10"
          >
            <div className="flex gap-3 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <label className="text-xs text-white/40 mb-1 block">{t.team_invite_email}</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                  onKeyDown={(e) => e.key === "Enter" && handleInvite()}
                />
              </div>
              <div>
                <label className="text-xs text-white/40 mb-1 block">{t.team_invite_role}</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as Role)}
                  className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                >
                  <option value="admin">{t.team_role_admin}</option>
                  <option value="developer">{t.team_role_developer}</option>
                  <option value="reviewer">{t.team_role_reviewer}</option>
                  <option value="viewer">{t.team_role_viewer}</option>
                </select>
              </div>
              <div className="flex items-end">
                <button
                  onClick={handleInvite}
                  disabled={!inviteEmail.trim() || inviteMut.isPending}
                  className="px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {inviteMut.isPending ? t.team_invite_sending : t.team_invite_send}
                </button>
              </div>
            </div>
            {inviteSuccess && (
              <p className="mt-2 text-sm text-emerald-400">{t.team_invite_sent}</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-violet-400" />
        </div>
      ) : members.length === 0 ? (
        <p className="text-white/30 text-sm text-center py-4">{t.team_no_teams}</p>
      ) : (
        <div className="space-y-2">
          {members.map((member: any) => {
            const isOwner = member.userId === ownerId;
            const role = member.role as Role;
            return (
              <div
                key={member.id}
                className="flex items-center justify-between p-3 bg-white/[0.02] rounded-xl hover:bg-white/[0.04] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center text-sm font-medium">
                    {(member.displayName || member.email || "?").charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {member.displayName || member.email}
                      </span>
                      {isOwner && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded-full font-medium">
                          {t.team_owner}
                        </span>
                      )}
                    </div>
                    {member.email && member.displayName && (
                      <span className="text-xs text-white/30">{member.email}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isOwner ? (
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border ${ROLE_COLORS[role]}`}>
                      {ROLE_ICONS[role]}
                      {t[`team_role_${role}` as keyof typeof t]}
                    </span>
                  ) : (
                    <>
                      <select
                        value={role}
                        onChange={(e) => handleRoleChange(member.userId, e.target.value as Role)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium border appearance-none cursor-pointer ${ROLE_COLORS[role]} bg-transparent`}
                      >
                        <option value="admin">{t.team_role_admin}</option>
                        <option value="developer">{t.team_role_developer}</option>
                        <option value="reviewer">{t.team_role_reviewer}</option>
                        <option value="viewer">{t.team_role_viewer}</option>
                      </select>
                      <button
                        onClick={() => handleRemove(member.userId)}
                        className="p-1.5 text-white/20 hover:text-red-400 transition-colors"
                        title={t.team_remove}
                      >
                        <UserMinus className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
