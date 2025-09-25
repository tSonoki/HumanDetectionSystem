# Answer側 WebRTC統計データ仕様書

## 概要

Answer側は映像を送信する側です。カメラからの映像ストリームをOffer側に配信し、送信品質とネットワーク性能を監視します。推論機能は搭載していません。

## データ収集方式
- **収集間隔**: 1秒
- **保存場所**: メモリ内配列（最大1000エントリ）
- **出力形式**: CSV
- **ファイル名**: `answer_webrtc_stats_YYYY-MM-DD_HH-MM-SS.csv`

## 全統計項目一覧

### 1. システム基本情報

| CSV列名 | データ型 | 説明 | 値の例 |
|---------|----------|------|---------|
| `timestamp` | string | データ収集時刻（ISO 8601形式） | `2024-01-15T10:30:45.123Z` |
| `side` | string | データ収集側の識別子 | `answer` |
| `connection_state` | string | WebRTC接続の全体状態 | `connected`, `connecting`, `disconnected`, `failed`, `closed` |
| `ice_connection_state` | string | ICE接続の状態 | `connected`, `checking`, `completed`, `failed`, `disconnected`, `closed` |
| `ice_gathering_state` | string | ICE候補収集の状態 | `complete`, `gathering`, `new` |
| `signaling_state` | string | WebRTCシグナリングの状態 | `stable`, `have-remote-offer`, `have-local-answer`, `have-remote-pranswer` |

### 2. コーデック統計

| CSV列名 | データ型 | 説明 | 値の例 |
|---------|----------|------|---------|
| `codec_payload_type` | number | RTPペイロードタイプ番号 | `96`, `97`, `98` |
| `codec_mime_type` | string | コーデックのMIMEタイプ | `video/VP8`, `video/H264`, `audio/opus` |
| `codec_clock_rate` | number | コーデックのクロックレート | `90000` (映像), `48000` (音声) |
| `codec_channels` | number | チャンネル数（音声のみ） | `1`, `2` |
| `codec_sdp_fmtp_line` | string | SDP形式のパラメータ行 | `profile-level-id=42e01f` |

### 3. 受信RTPストリーム統計（フィードバック受信）

| CSV列名 | データ型 | 説明 | 単位 | 値の例 |
|---------|----------|------|------|---------|
| `inbound_packets_received` | number | 累計受信パケット数（制御信号等） | パケット | `234` |
| `inbound_bytes_received` | number | 累計受信バイト数（制御信号等） | バイト | `45678` |
| `inbound_packets_lost` | number | 累計損失パケット数 | パケット | `1` |
| `inbound_jitter` | number | パケット到着間隔のばらつき | 秒 | `0.001` |
| `inbound_frames_decoded` | number | 累計デコード済みフレーム数 | フレーム | `0` |
| `inbound_key_frames_decoded` | number | 累計キーフレームデコード数 | フレーム | `0` |
| `inbound_frame_width` | number | 受信フレームの幅 | ピクセル | `0` |
| `inbound_frame_height` | number | 受信フレームの高さ | ピクセル | `0` |
| `inbound_frames_per_second` | number | 受信フレームレート | fps | `0` |
| `inbound_qp_sum` | number | 量子化パラメータの累計 | - | `0` |
| `inbound_total_decode_time` | number | 累計デコード処理時間 | 秒 | `0` |
| `inbound_total_inter_frame_delay` | number | フレーム間遅延の累計 | 秒 | `0` |
| `inbound_audio_level` | number | 受信音声レベル | 0.0-1.0 | `0` |
| `inbound_total_audio_energy` | number | 累計音声エネルギー | - | `0` |
| `inbound_concealed_samples` | number | 隠蔽された音声サンプル数 | サンプル | `0` |

### 4. 送信RTPストリーム統計（映像送信品質監視）

| CSV列名 | データ型 | 説明 | 単位 | 値の例 |
|---------|----------|------|------|---------|
| `outbound_packets_sent` | number | 累計送信パケット数 | パケット | `45678` |
| `outbound_bytes_sent` | number | 累計送信バイト数 | バイト | `12345678` |
| `outbound_target_bitrate` | number | 目標ビットレート | bps | `2000000` |
| `outbound_frames_encoded` | number | 累計エンコード済みフレーム数 | フレーム | `1520` |
| `outbound_key_frames_encoded` | number | 累計キーフレームエンコード数 | フレーム | `48` |
| `outbound_total_encode_time` | number | 累計エンコード処理時間 | 秒 | `4.567` |
| `outbound_total_packet_send_delay` | number | パケット送信遅延の累計 | 秒 | `0.234` |
| `outbound_quality_limitation_reason` | string | 品質制限の理由 | - | `bandwidth`, `cpu`, `none`, `other` |
| `outbound_quality_limitation_durations` | object | 品質制限継続時間の詳細 | - | `{"bandwidth":1.2,"cpu":0.8}` |
| `outbound_nack_count` | number | 受信NACK（再送要求）数 | 回 | `5` |
| `outbound_fir_count` | number | 受信FIR（フルイントラリクエスト）数 | 回 | `2` |
| `outbound_pli_count` | number | 受信PLI（ピクチャーロスインディケーション）数 | 回 | `1` |
| `outbound_encoder_implementation` | string | エンコーダー実装名 | - | `libvpx`, `ExternalEncoder` |

### 5. リモート側統計（Offer側の受信状況）

| CSV列名 | データ型 | 説明 | 単位 | 値の例 |
|---------|----------|------|------|---------|
| `remote_inbound_packets_lost` | number | リモート側での損失パケット数 | パケット | `12` |
| `remote_inbound_jitter` | number | リモート側でのジッター | 秒 | `0.003` |
| `remote_inbound_round_trip_time` | number | 現在のRTT（往復時間） | 秒 | `0.045` |
| `remote_inbound_total_round_trip_time` | number | RTTの累計時間 | 秒 | `23.456` |
| `remote_inbound_fraction_lost` | number | リモート側での損失率 | 0.0-1.0 | `0.0003` |

| CSV列名 | データ型 | 説明 | 単位 | 値の例 |
|---------|----------|------|------|---------|
| `remote_outbound_packets_sent` | number | リモート側から送信されたパケット数 | パケット | `8765` |
| `remote_outbound_bytes_sent` | number | リモート側から送信されたバイト数 | バイト | `987654` |
| `remote_outbound_remote_timestamp` | number | リモートタイムスタンプ | - | `1642243845123` |

### 6. メディアソース統計（カメラ映像ソース）

| CSV列名 | データ型 | 説明 | 値の例 |
|---------|----------|------|---------|
| `media_source_track_identifier` | string | メディアトラックの識別子 | `{12345678-1234-5678-9abc-def012345678}` |
| `media_source_kind` | string | メディアの種類 | `video`, `audio` |
| `media_source_width` | number | ソース映像の幅（映像のみ） | `1920` |
| `media_source_height` | number | ソース映像の高さ（映像のみ） | `1080` |
| `media_source_frames` | number | ソースフレーム総数 | `1523` |
| `media_source_frames_per_second` | number | ソースフレームレート | `30.0` |
| `media_source_audio_level` | number | ソース音声レベル（音声のみ） | `0.0` |
| `media_source_total_audio_energy` | number | 累計音声エネルギー（音声のみ） | `0.0` |

### 7. CSRC統計

| CSV列名 | データ型 | 説明 | 値の例 |
|---------|----------|------|---------|
| `csrc_contributor_ssrc` | number | コントリビューターSSRC | `1234567890` |
| `csrc_inbound_rtp_stream_id` | string | 関連するRTPストリームID | `RTCInboundRTPVideoStream_1234567890` |

### 8. ピア接続統計

| CSV列名 | データ型 | 説明 | 単位 | 値の例 |
|---------|----------|------|------|---------|
| `peer_connection_data_channels_opened` | number | 開いたデータチャンネル数 | 個 | `0` |
| `peer_connection_data_channels_closed` | number | 閉じたデータチャンネル数 | 個 | `0` |

### 9. データチャンネル統計

| CSV列名 | データ型 | 説明 | 単位 | 値の例 |
|---------|----------|------|------|---------|
| `data_channel_label` | string | データチャンネルのラベル | - | `chat` |
| `data_channel_protocol` | string | 使用プロトコル | - | `sctp` |
| `data_channel_identifier` | number | データチャンネル識別子 | - | `1` |
| `data_channel_state` | string | データチャンネルの状態 | - | `open`, `connecting`, `closing`, `closed` |
| `data_channel_messages_sent` | number | 送信メッセージ数 | 個 | `89` |
| `data_channel_bytes_sent` | number | 送信バイト数 | バイト | `2345` |
| `data_channel_messages_received` | number | 受信メッセージ数 | 個 | `123` |
| `data_channel_bytes_received` | number | 受信バイト数 | バイト | `4567` |

### 10. ストリーム統計（非推奨）

| CSV列名 | データ型 | 説明 | 値の例 |
|---------|----------|------|---------|
| `stream_identifier` | string | ストリーム識別子 | `{87654321-4321-8765-cba9-876543210fed}` |
| `stream_track_ids` | array | 関連するトラックID配列 | `["track1", "track2"]` |

### 11. トラック統計（非推奨）

| CSV列名 | データ型 | 説明 | 値の例 |
|---------|----------|------|---------|
| `track_identifier` | string | トラック識別子 | `{13579246-1357-9246-8024-135792468024}` |
| `track_remote_source` | boolean | リモートソースかどうか | `false` |
| `track_ended` | boolean | トラックが終了しているか | `false`, `true` |

### 12. トランシーバー統計

| CSV列名 | データ型 | 説明 | 値の例 |
|---------|----------|------|---------|
| `transceiver_sender_id` | string | 送信者ID | `RTCRtpSender_12345` |
| `transceiver_receiver_id` | string | 受信者ID | `RTCRtpReceiver_67890` |
| `transceiver_media_id` | string | メディアID | `0` |

### 13. 送信者統計

| CSV列名 | データ型 | 説明 | 値の例 |
|---------|----------|------|---------|
| `sender_media_source_id` | string | メディアソースID | `RTCVideoSource_1` |
| `sender_track_id` | string | 送信トラックID | `{track-id-12345}` |

### 14. 受信者統計

| CSV列名 | データ型 | 説明 | 単位 | 値の例 |
|---------|----------|------|------|---------|
| `receiver_track_id` | string | 受信トラックID | - | `{track-id-67890}` |
| `receiver_jitter_buffer_delay` | number | ジッターバッファ遅延 | 秒 | `0.0` |
| `receiver_jitter_buffer_emitted_count` | number | ジッターバッファ出力数 | 個 | `0` |

### 15. トランスポート統計

| CSV列名 | データ型 | 説明 | 単位 | 値の例 |
|---------|----------|------|------|---------|
| `transport_bytes_sent` | number | 送信バイト数 | バイト | `9876543` |
| `transport_bytes_received` | number | 受信バイト数 | バイト | `123456` |
| `transport_dtls_state` | string | DTLS接続状態 | - | `connected`, `connecting`, `closed`, `failed` |
| `transport_selected_candidate_pair_id` | string | 選択された候補ペアID | - | `RTCIceCandidatePair_87654321` |
| `transport_local_certificate_id` | string | ローカル証明書ID | - | `RTCCertificate_local_67890` |
| `transport_remote_certificate_id` | string | リモート証明書ID | - | `RTCCertificate_remote_12345` |
| `transport_tls_version` | string | TLSバージョン | - | `TLS1.2`, `TLS1.3` |
| `transport_dtls_cipher` | string | DTLS暗号スイート | - | `TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256` |
| `transport_ice_role` | string | ICEロール | - | `controlled`, `controlling` |
| `transport_ice_local_username_fragment` | string | ICEローカルユーザー名フラグメント | - | `efgh5678` |
| `transport_ice_state` | string | ICE状態 | - | `connected`, `checking`, `completed` |

### 16. ICE候補ペア統計

| CSV列名 | データ型 | 説明 | 単位 | 値の例 |
|---------|----------|------|------|---------|
| `candidate_pair_local_candidate_id` | string | ローカル候補ID | - | `RTCIceCandidate_local_67890` |
| `candidate_pair_remote_candidate_id` | string | リモート候補ID | - | `RTCIceCandidate_remote_12345` |
| `candidate_pair_state` | string | 候補ペアの状態 | - | `succeeded`, `in-progress`, `failed` |
| `candidate_pair_nominated` | boolean | ノミネート済みかどうか | - | `true`, `false` |
| `candidate_pair_bytes_sent` | number | 送信バイト数 | バイト | `654321` |
| `candidate_pair_bytes_received` | number | 受信バイト数 | バイト | `123456` |
| `candidate_pair_last_packet_sent_timestamp` | number | 最終パケット送信時刻 | ミリ秒 | `1642243845125` |
| `candidate_pair_last_packet_received_timestamp` | number | 最終パケット受信時刻 | ミリ秒 | `1642243845123` |
| `candidate_pair_total_round_trip_time` | number | 累計RTT | 秒 | `4.567` |
| `candidate_pair_current_round_trip_time` | number | 現在のRTT | 秒 | `0.045` |
| `candidate_pair_available_outgoing_bitrate` | number | 利用可能送信ビットレート | bps | `2500000` |
| `candidate_pair_requests_received` | number | 受信リクエスト数 | 個 | `24` |
| `candidate_pair_requests_sent` | number | 送信リクエスト数 | 個 | `25` |
| `candidate_pair_responses_received` | number | 受信レスポンス数 | 個 | `25` |
| `candidate_pair_responses_sent` | number | 送信レスポンス数 | 個 | `24` |
| `candidate_pair_consent_requests_sent` | number | 同意リクエスト送信数 | 個 | `12` |

### 17. ローカル・リモート候補統計

#### ローカル候補
| CSV列名 | データ型 | 説明 | 値の例 |
|---------|----------|------|---------|
| `local_candidate_transport_id` | string | トランスポートID | `RTCTransport_0_1` |
| `local_candidate_address` | string | ローカルIPアドレス | `10.0.0.35` |
| `local_candidate_port` | number | ローカルポート番号 | `48192` |
| `local_candidate_protocol` | string | 通信プロトコル | `udp`, `tcp` |
| `local_candidate_type` | string | 候補タイプ | `host`, `srflx`, `prflx`, `relay` |
| `local_candidate_priority` | number | 候補の優先度 | `2130706175` |
| `local_candidate_url` | string | STUNサーバーURL（該当する場合） | `stun:10.100.0.35:3478` |

#### リモート候補
| CSV列名 | データ型 | 説明 | 値の例 |
|---------|----------|------|---------|
| `remote_candidate_transport_id` | string | トランスポートID | `RTCTransport_0_1` |
| `remote_candidate_address` | string | リモートIPアドレス | `192.168.1.100` |
| `remote_candidate_port` | number | リモートポート番号 | `51234` |
| `remote_candidate_protocol` | string | 通信プロトコル | `udp`, `tcp` |
| `remote_candidate_type` | string | 候補タイプ | `host`, `srflx`, `prflx`, `relay` |
| `remote_candidate_priority` | number | 候補の優先度 | `2130706431` |
| `remote_candidate_url` | string | STUNサーバーURL（該当する場合） | `stun:stun.example.com:3478` |

### 18. 証明書統計

| CSV列名 | データ型 | 説明 | 値の例 |
|---------|----------|------|---------|
| `certificate_fingerprint` | string | 証明書フィンガープリント | `F6:E5:D4:C3:B2:A1:...` |
| `certificate_fingerprint_algorithm` | string | フィンガープリントアルゴリズム | `sha-256`, `sha-1` |
| `certificate_base64_certificate` | string | Base64エンコードされた証明書 | `MIICYjCCAdCgAwIBAgI...` |

### 19. レポート概要統計

| CSV列名 | データ型 | 説明 | 単位 | 値の例 |
|---------|----------|------|------|---------|
| `report_types_count` | number | 収集されたレポートタイプ数 | 個 | `11` |
| `report_types` | string | 収集されたレポートタイプのリスト | - | `codec\|outbound-rtp\|media-source\|transport` |
| `total_reports` | number | 総レポート数 | 個 | `38` |

## 使用方法

### 1. データ収集の開始
1. カメラアクセス許可を取得
2. 「Get Capture」ボタンでカメラストリーム開始
3. Offer側からWebRTC接続要求受信
4. 自動的に1秒間隔で統計収集開始

### 2. カメラ設定
1. ドロップダウンで使用するカメラを選択
2. 映像品質は自動的にネットワーク状況に応じて調整

### 3. CSV出力
1. 「統計保存」ボタンをクリック
2. ファイルが自動ダウンロード開始

### 4. データ分析のポイント

#### 送信品質評価
- `outbound_frames_encoded` / 稼働時間 で実際の送信FPS算出
- `outbound_target_bitrate` で現在の送信ビットレート監視
- `outbound_quality_limitation_reason` で送信制限要因特定

#### ネットワーク品質評価
- `candidate_pair_current_round_trip_time` でレイテンシ監視
- `remote_inbound_packets_lost` / `outbound_packets_sent` で相手側パケット損失率
- `remote_inbound_fraction_lost` で直接的な損失率確認

#### カメラソース品質
- `media_source_width` × `media_source_height` でソース解像度確認
- `media_source_frames_per_second` でカメラのネイティブFPS
- `media_source_frames` で総撮影フレーム数

## Answer側特有の注意事項

### 送信品質の最適化
1. **ビットレート制限**: `outbound_quality_limitation_reason` が `bandwidth` の場合、ネットワーク帯域が不足
2. **CPU制限**: `cpu` の場合、エンコード処理能力不足
3. **カメラ品質**: `media_source_frames_per_second` が期待値より低い場合、カメラまたはシステム性能に問題

### 推論統計の違い
- Answer側では推論関連統計（`inference_*`, `detections_*`）は収集されません
- 推論結果はOffer側でのみ取得可能

### データチャンネル通信
- Answer側は主にOffer側からの制御信号（緊急停止、品質設定変更等）を受信
- `data_channel_messages_received` > `data_channel_messages_sent` の傾向

## トラブルシューティング

### 「統計データなし」エラー
**解決手順**:
1. カメラアクセス許可確認
2. 「Get Capture」でカメラストリーム開始
3. Offer側から「Send SDP」で接続開始
4. `connection_state` が `connected` になるまで待機

### カメラ映像が出力されない
- `media_source_frames` が増加しているか確認
- `outbound_frames_encoded` が0の場合、エンコーダー問題
- ブラウザでカメラアクセス許可を再確認

### 映像品質が低い
- `outbound_quality_limitation_reason` で制限要因特定
- `bandwidth`: ネットワーク環境改善
- `cpu`: ブラウザまたはシステム負荷軽減
- `none`: Offer側の受信能力確認

## 統計項目の活用例

### 送信性能監視
```
実際送信FPS = outbound_frames_encoded / 稼働時間(秒)
エンコード効率 = outbound_total_encode_time / outbound_frames_encoded
```

### ネットワーク品質評価
```
RTT = candidate_pair_current_round_trip_time
損失率 = remote_inbound_fraction_lost
帯域利用率 = outbound_bytes_sent * 8 / 測定時間(秒) / 利用可能帯域
```

### カメラ性能評価
```
カメラFPS = media_source_frames_per_second
解像度 = media_source_width × media_source_height
```

---
**最終更新**: 2024年1月
**対象バージョン**: HumanDetectionSystem v1.0