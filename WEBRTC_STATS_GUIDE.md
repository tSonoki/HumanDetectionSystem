# WebRTC統計データ収集ガイド

このドキュメントでは、HumanDetectionSystemで収集しているWebRTC統計データについて詳しく説明します。

## 概要

システムは1秒間隔でWebRTC統計を自動収集し、CSVファイルとして出力できます。統計データには接続品質、映像品質、推論性能などの情報が含まれています。

## 統計データの種類

### 基本接続情報
| 項目名 | 説明 | 例 |
|--------|------|-----|
| `timestamp` | データ収集時刻 | 2024-01-01T12:00:00.000Z |
| `side` | データ収集側 | offer / answer |
| `connection_state` | WebRTC接続状態 | connected, connecting, closed |
| `ice_connection_state` | ICE接続状態 | connected, checking, failed |
| `ice_gathering_state` | ICE候補収集状態 | complete, gathering |
| `signaling_state` | シグナリング状態 | stable, have-local-offer |

### 推論性能統計（Offer側のみ）
| 項目名 | 説明 | 単位 |
|--------|------|------|
| `inference_enabled` | 推論機能有効/無効 | true/false |
| `total_inferences` | 総推論実行回数 | 回 |
| `detections_count` | 検出オブジェクト総数 | 個 |
| `detections_person_count` | 人物検出数 | 人 |
| `max_confidence` | 最高信頼度 | 0.0-1.0 |
| `avg_confidence` | 平均信頼度 | 0.0-1.0 |
| `person_max_area` | 最大人物領域面積 | px² |

### コーデック統計
| 項目名 | 説明 | 例 |
|--------|------|-----|
| `codec_payload_type` | ペイロードタイプ番号 | 96, 97 |
| `codec_mime_type` | コーデックタイプ | video/VP8, video/H264 |
| `codec_clock_rate` | クロックレート | 90000 |
| `codec_channels` | チャンネル数（音声） | 1, 2 |

### 受信RTPストリーム統計
| 項目名 | 説明 | 単位 |
|--------|------|------|
| `inbound_packets_received` | 受信パケット数 | パケット |
| `inbound_bytes_received` | 受信バイト数 | バイト |
| `inbound_packets_lost` | 損失パケット数 | パケット |
| `inbound_jitter` | ジッター | 秒 |
| `inbound_frames_decoded` | デコード済みフレーム数 | フレーム |
| `inbound_key_frames_decoded` | キーフレームデコード数 | フレーム |
| `inbound_frame_width` | フレーム幅 | ピクセル |
| `inbound_frame_height` | フレーム高 | ピクセル |
| `inbound_frames_per_second` | 受信FPS | fps |
| `inbound_total_decode_time` | 総デコード時間 | 秒 |

### 送信RTPストリーム統計
| 項目名 | 説明 | 単位 |
|--------|------|------|
| `outbound_packets_sent` | 送信パケット数 | パケット |
| `outbound_bytes_sent` | 送信バイト数 | バイト |
| `outbound_target_bitrate` | ターゲットビットレート | bps |
| `outbound_frames_encoded` | エンコード済みフレーム数 | フレーム |
| `outbound_key_frames_encoded` | キーフレームエンコード数 | フレーム |
| `outbound_total_encode_time` | 総エンコード時間 | 秒 |
| `outbound_quality_limitation_reason` | 品質制限理由 | bandwidth, cpu, none |
| `outbound_nack_count` | NACK数 | 回 |
| `outbound_fir_count` | FIR数 | 回 |
| `outbound_pli_count` | PLI数 | 回 |

### リモート統計
| 項目名 | 説明 | 単位 |
|--------|------|------|
| `remote_inbound_packets_lost` | リモート側損失パケット数 | パケット |
| `remote_inbound_jitter` | リモート側ジッター | 秒 |
| `remote_inbound_round_trip_time` | RTT | 秒 |
| `remote_inbound_total_round_trip_time` | 累計RTT | 秒 |
| `remote_inbound_fraction_lost` | 損失率 | 0.0-1.0 |

### トランスポート層統計
| 項目名 | 説明 | 例 |
|--------|------|-----|
| `transport_bytes_sent` | 送信バイト数 | バイト |
| `transport_bytes_received` | 受信バイト数 | バイト |
| `transport_dtls_state` | DTLS状態 | connected, connecting |
| `transport_ice_role` | ICEロール | controlling, controlled |
| `transport_ice_state` | ICE状態 | connected, checking |

### ICE候補ペア統計
| 項目名 | 説明 | 単位 |
|--------|------|------|
| `candidate_pair_state` | 候補ペア状態 | succeeded, in-progress |
| `candidate_pair_nominated` | ノミネート済み | true/false |
| `candidate_pair_bytes_sent` | 送信バイト数 | バイト |
| `candidate_pair_bytes_received` | 受信バイト数 | バイト |
| `candidate_pair_total_round_trip_time` | 総RTT | 秒 |
| `candidate_pair_current_round_trip_time` | 現在のRTT | 秒 |
| `candidate_pair_available_outgoing_bitrate` | 利用可能送信ビットレート | bps |

### ローカル・リモート候補統計
| 項目名 | 説明 | 例 |
|--------|------|-----|
| `local_candidate_address` | ローカルIPアドレス | 192.168.1.100 |
| `local_candidate_port` | ローカルポート | 12345 |
| `local_candidate_protocol` | プロトコル | udp, tcp |
| `local_candidate_type` | 候補タイプ | host, srflx, relay |
| `remote_candidate_address` | リモートIPアドレス | 10.0.0.1 |
| `remote_candidate_port` | リモートポート | 54321 |

## CSV出力機能

### 使用方法
1. **Offer側**: 「遅延ログ保存」ボタンをクリック
2. **Answer側**: 「統計保存」ボタンをクリック
3. ファイル名: `offer_webrtc_stats_YYYY-MM-DD_HH-mm-ss.csv` または `answer_webrtc_stats_YYYY-MM-DD_HH-mm-ss.csv`

### 前提条件
- WebRTC接続が確立されていること
- 統計データが収集されていること（接続後1秒以上経過）
- Offer側の場合：推論機能が有効でカメラ映像が取得されていること

### 出力例
```csv
timestamp,side,connection_state,inbound_packets_received,outbound_bytes_sent
2024-01-01T12:00:00.000Z,offer,connected,1234,567890
2024-01-01T12:00:01.000Z,offer,connected,1240,568100
```

## トラブルシューティング

### 「保存する統計データがありません」エラー
**原因**: WebRTC接続が確立されていないか、統計収集が開始されていません

**解決方法**:
1. Answer側でカメラを取得（Get Captureボタン）
2. Offer側からWebRTC接続開始（Send SDPボタン）
3. 接続状態が「connected」になるまで待機
4. 1秒以上経過後に統計保存を実行

### 項目名が空白になる問題
**原因**: 予期しないWebRTC統計項目が検出された場合

**解決方法**:
- ブラウザの開発者コンソールで警告メッセージを確認
- 「Empty headers found」や「Suspicious headers found」の内容をチェック

### データが不完全
**原因**: WebRTC接続の品質やブラウザの実装により、一部の統計項目が利用できない場合があります

**対処法**:
- 安定したネットワーク環境で実行
- 最新のブラウザ（Chrome、Edge推奨）を使用
- 統計収集時間を長くする（数分間接続を維持）

## 統計項目の活用方法

### 接続品質の監視
- `connection_state`: 接続の安定性
- `candidate_pair_current_round_trip_time`: レイテンシ
- `inbound_packets_lost` / `outbound_packets_sent`: パケット損失率

### 映像品質の評価
- `inbound_frames_per_second`: 受信フレームレート
- `outbound_target_bitrate`: 送信ビットレート
- `outbound_quality_limitation_reason`: 品質制限の原因

### 推論性能の分析
- `total_inferences`: 推論実行頻度
- `detections_person_count`: 人物検出精度
- `avg_confidence`: 検出信頼度

---

**注意**: このドキュメントの統計項目は、使用するブラウザとWebRTC実装によって異なる場合があります。実際の出力ファイルで利用可能な項目を確認してください。