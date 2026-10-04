// アプリ間で <script> をまたいで共有するグローバル変数の宣言。型チェック用で、配信はしない。
declare var GC: any;           // くもみち（gcp-cert/）: 資格・問題・ノートのデータ
interface Window {
  GC: any;
  OkuruMae: any;               // おくるまえに（mail-check/）: 点検エンジン
}
