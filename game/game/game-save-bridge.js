
過去のメッセージを読み込み中…
game フォルダ  は作る？

うん、リポジトリの一番上に game フォルダを作るよ。その中に次の2つを入れる。

index.html
game-save-bridge.js
GitHubで Add file → Create new file を選んで、ファイル名に game/index.html と入力すると、game フォルダも自動で作られるよ。

入れ方わからない
大丈夫。ゲームのコードはもうファイルになっているので、コードに変換する必要はないよ。まず2つのファイルを保存しよう。

ゲーム本体 index.html
 を開いて、ダウンロードする。
セーブ連携 game-save-bridge.js
 も同じようにダウンロードする。
リンクを押してコードが表示されたら、画面のダウンロードボタンを押してね。保存できたら、GitHubでの入れ方を次に案内するよ。ゲーム本体は、勉強アプリの一番上にある index.html とは別のファイルだよ。


index.html
HTML

game-save-bridge.js
コード
僕のgithubを君が編集することできる？
できるよ。ただ、今はGitHub連携がまだつながっていないので、こちらから直接編集はできない状態。GitHubの連携を設定して、kuse-o9/knowledge-construction へのアクセスを許可してくれたら、ゲームのファイルを入れる作業をこちらで進められるよ。

今は、ファイルを保存して自分でGitHubに入れる方法も案内できる。

GitHubの連携を設定する
GitHub連携の設定を始めたよ。まだ接続は完了していないので、画面に出る案内に沿ってGitHubにログインし、kuse-o9/knowledge-construction へのアクセスを許可してね。終わったら「つながった」と教えて。確認して、ゲームのファイルを入れる作業に進むよ。

ごめん、それ無理だった。
大丈夫、謝らなくていいよ。GitHub連携なしでも進められる。GitHubの画面から手動で入れる方法に切り替えて、順番に案内するね。

まず確認したいのは、前に案内した index.html と game-save-bridge.js をパソコンに保存できたか。どちらの状態かな？

23s間作業しました
コードは保存できなかったから、index.html と game-save-bridge.js  をこーどにして、僕に伝えて。
index.html と game-save-bridge.js  だけでいいんだよね？　githubに移すのは

うん、game フォルダの中に入れるゲーム用コードは2ファイルだよ。SQLはSupabaseで実行済みだから、GitHubには入れなくて大丈夫。

まず、リンクを開いてコードをコピーしてね。開いた画面で Ctrl+A → Ctrl+C を押すと、全部コピーできるよ。

ゲーム本体のコード（index.html）
セーブ連携のコード（game-save-bridge.js）
GitHubでは、リポジトリの 「Add file」→「Create new file」 を押して、ファイル名の欄に game/index.html と入力し、コピーしたゲーム本体のコードを貼り付けて保存する。もう一度同じ操作をして、ファイル名を game/game-save-bridge.js にし、セーブ連携のコードを貼り付けて保存する。game/ フォルダは、このファイル名で自動的に作られるよ。

最後に、勉強アプリのホーム画面からゲームを開けるように、もともとのルートにある index.html にもリンクを追加する必要がある。つまり、ゲーム用は2ファイルで、ホーム画面への入口を既存ファイルに追加する作業が1か所あるよ。


index.html.copy.txt
ドキュメント

game-save-bridge.js.copy.txt
ドキュメント
// Connects game.html to the signed-in user's Supabase save row.
// Call once from the study app after creating its Supabase client.
const GAME_ID = 'komorebi-island-v1';
const RESOURCE_KEYS = ['wood', 'stone', 'flower', 'seaFish', 'lakeFish', 'riverFish', 'money', 'bankBalance'];

export function installGameSaveBridge(supabaseClient, onHome) {
  async function signedInUser() {
    const { data, error } = await supabaseClient.auth.getUser();
    if (error) throw error;
    return data.user;
  }

  async function claimResourceGrants() {
    const { data, error } = await supabaseClient.rpc('game_claim_resource_grants');
    if (error) {
      // Keep ordinary saves working before the optional admin migration is installed.
      if (error.code === 'PGRST202' || /game_claim_resource_grants/i.test(error.message || '')) return {};
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
        if (error.code === 'PGRST202' || /game_admin_is_admin/i.test(error.message || '')) return false;
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


