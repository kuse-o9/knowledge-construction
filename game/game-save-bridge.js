// Connects game.html to the signed-in user's Supabase save row.
// Call once from the study app after creating its Supabase client.
const GAME_ID = 'komorebi-island-v1';
const RESOURCE_KEYS = ['wood', 'stone', 'flower', 'seaFish', 'lakeFish', 'riverFish', 'money', 'bankBalance'];

export function installGameSaveBridge(supabaseClient, onHome) {
  let expectedId;
  const initialUser=supabaseClient.auth.getUser().then(({data,error})=>{if(error&&error.name!=='AuthSessionMissingError')throw error;expectedId=data.user?.id||null;return data.user;});
  // Register after the first identity is known; check again before every mutation.
  initialUser.then(()=>supabaseClient.auth.onAuthStateChange((event,session)=>{if((session?.user?.id||null)!==expectedId)window.dispatchEvent(new Event('game-account-changed'));})).catch(()=>{});
  async function signedInUser() {
    await initialUser;
    const { data, error } = await supabaseClient.auth.getUser();
    if (error&&error.name!=='AuthSessionMissingError') throw error;
    if((data.user?.id||null)!==expectedId)throw new Error('アカウントが変わりました。島を更新してください。');
    return data.user;
  }

  async function claimResourceGrants() {
    const user=await signedInUser();if(!user)return {};
    const { data, error } = await supabaseClient.rpc('game_claim_resource_grants');
    if (error) {
      // Keep ordinary saves working before the optional admin migration is installed.
      if (error.code === 'PGRST202') return {};
      throw error;
    }
    return data || {};
  }

  function mergeGrants(saveData, grants) {
    const next = { ...saveData, inventory: { ...(saveData?.inventory || {}) } };
    for (const key of RESOURCE_KEYS) {
      const amount = Number(grants[key] || 0);
      if (!amount) continue;
      if (key === 'money' || key === 'bankBalance') next[key] = Number(next[key] || 0) + amount;
      else next.inventory[key] = Number(next.inventory[key] || 0) + amount;
    }
    return next;
  }

  window.GameSaveBridge = {
    async load() {
      const user = await signedInUser();
      if (!user) return null;

      const { data, error } = await supabaseClient
        .from('game_saves')
        .select('save_data')
        .eq('game_id', GAME_ID)
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      if (!data?.save_data) return null;

      const grants = await claimResourceGrants();
      if (Object.values(grants).some(value => Number(value) > 0)) {
        const saveData = mergeGrants(data.save_data, grants);
        const { error: saveError } = await supabaseClient.from('game_saves').upsert({
          user_id: user.id,
          game_id: GAME_ID,
          save_data: saveData,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,game_id' });
        if (saveError) throw saveError;
        return saveData;
      }
      return data.save_data;
    },

    async save(saveData) {
      const user = await signedInUser();
      if (!user) throw new Error('ゲームを保存するにはログインしてください。');

      const { error } = await supabaseClient.from('game_saves').upsert({
        user_id: user.id,
        game_id: GAME_ID,
        save_data: saveData,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,game_id' });
      if (error) throw error;
    },

    async isGameAdmin() {
      const user = await signedInUser();
      if (!user) return false;
      const { data, error } = await supabaseClient.rpc('game_admin_is_admin');
      if (error) {
        if (error.code === 'PGRST202') return false;
        throw error;
      }
      return data === true;
    },

    async listGamePlayers() {
      const { data, error } = await supabaseClient.rpc('game_admin_list_players');
      if (error) throw error;
      return data || [];
    },

    async addGameResource(userId, resourceKey, amount) {
      if (!RESOURCE_KEYS.includes(resourceKey)) throw new Error('選べない資源です');
      const { data, error } = await supabaseClient.rpc('game_admin_add_resource', {
        p_target_user_id: userId,
        p_resource_key: resourceKey,
        p_amount: amount
      });
      if (error) throw error;
      return data;
    },

    async claimGameResourceGrants() {
      return claimResourceGrants();
    },

    async currentUserId() {
      return (await signedInUser())?.id || null;
    },

    goHome() {
      if (typeof onHome === 'function') onHome();
    }
  };
}
