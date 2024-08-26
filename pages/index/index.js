import TextEncoder from './miniprogram-text-encoder'

Page({
    data: {
        status: '未连接',
        deviceId: null,
        serviceId: null,
        characteristicId: null,
        deviceName: 'None' // 默认设备名称
    },
    onLoad() {
        this.initBluetooth();
    },
    onDeviceNameInput(e) {
      console.log(e.detail.value);
        this.setData({
            deviceName: e.detail.value,
        })
        ;
    },
    initBluetooth() {
        const that = this;
        wx.openBluetoothAdapter({
            success(res) {
                console.log('初始化蓝牙适配器成功');
                that.startBluetoothDevicesDiscovery();
                wx.showToast({
                  title: '蓝牙权限成功',
                  icon: 'success',
                  duration: 2000
                });    
            },
            fail(res) {
                console.log('初始化蓝牙适配器失败', res);
                wx.showToast({
                  title: '蓝牙权限失败',
                  icon: 'error',
                  duration: 2000
                });    
            }
        });
    },
    startBluetoothDevicesDiscovery() {
      const that = this;
      console.log(that.data.deviceName, '57');
  
      // 如果 deviceName 是 "None"，不进行蓝牙设备搜索
      if (that.data.deviceName === "None") {
          console.log('设备名称为 "None"，不进行蓝牙设备搜索');
          return;
      }
  
      wx.startBluetoothDevicesDiscovery({
          success(res) {
              console.log('开始搜索蓝牙设备');
              that.onBluetoothDeviceFound();
          },
          fail(res) {
              console.log('搜索蓝牙设备失败', res);
          }
      });
  },
    onBluetoothDeviceFound() {
      const that = this;
      wx.onBluetoothDeviceFound((devices) => {
          devices.devices.forEach(device => {
              console.log('发现设备名称：', device.name); // 打印所有发现的设备名称
              if (device.name === that.data.deviceName) {
                  wx.showToast({
                    title: '发现蓝牙设备',
                    icon: 'success',
                    duration: 2000
                  });
                  that.createBLEConnection(device.deviceId);
              }
          });
      });
  },
    createBLEConnection(deviceId) {
        const that = this;
        wx.createBLEConnection({
            deviceId: deviceId,
            success(res) {
                console.log('连接蓝牙设备成功');
                that.setData({
                    status: '已连接',
                    deviceId: deviceId
                });
                that.getBLEDeviceServices(deviceId);            
            },
            fail(res) {
                console.log('连接蓝牙设备失败', res);
            }
        });
    },
    getBLEDeviceServices(deviceId) {
        const that = this;
        wx.getBLEDeviceServices({
            deviceId: deviceId,
            success(res) {
                console.log('获取服务成功：', res.services);
                for (let i = 0; i < res.services.length; i++) {
                    if (res.services[i].isPrimary) {
                        that.getBLEDeviceCharacteristics(deviceId, res.services[i].uuid);
                        return;
                    }
                }
            }
        });
    },
    getBLEDeviceCharacteristics(deviceId, serviceId) {
        const that = this;
        wx.getBLEDeviceCharacteristics({
            deviceId: deviceId,
            serviceId: serviceId,
            success(res) {
                console.log('获取特征值成功：', res.characteristics);
                for (let i = 0; i < res.characteristics.length; i++) {
                    if (res.characteristics[i].properties.write) {
                        that.setData({
                            serviceId: serviceId,
                            characteristicId: res.characteristics[i].uuid
                        });
                        return;
                    }
                }
            }
        });
    },
    connectDevice() {
        this.startBluetoothDevicesDiscovery();
    },
    sendData() {
        const that = this;
        // 选择本地 TXT 或 PY 文件
        wx.chooseMessageFile({
            count: 1,
            type: 'file',
            extension: ['txt', 'py'],
            success(res) {
                const filePath = res.tempFiles[0].path;
                const fileName = res.tempFiles[0].name;

                // 读取文件内容为 ArrayBuffer
                wx.getFileSystemManager().readFile({
                    filePath: filePath,
                    success(readRes) {
                        const fileBuffer = readRes.data;
                        console.log(readRes.data)
                        const chunkSize = 20; // 每次发送20字节
                        const totalChunks = Math.ceil(fileBuffer.byteLength / chunkSize);

                        // 发送文件名称和分片数
                        const fileInfo = `${fileName}|${totalChunks}`;
                        const fileInfoBuffer = that.stringToArrayBuffer(fileInfo);
                        wx.writeBLECharacteristicValue({
                            deviceId: that.data.deviceId,
                            serviceId: that.data.serviceId,
                            characteristicId: that.data.characteristicId,
                            value: fileInfoBuffer,
                            success(res) {
                                console.log('文件信息发送成功');
                            },
                            fail(res) {
                                console.error('文件信息发送失败', res);
                            }
                        });

                        // 逐块发送文件数据
                        for (let i = 0; i < totalChunks; i++) {
                            const start = i * chunkSize;
                            const end = Math.min(start + chunkSize, fileBuffer.byteLength);
                            const chunk = fileBuffer.slice(start, end);
                            const progress = ((i + 1) / totalChunks) * 100;

                            // 发送当前块数据
                            wx.writeBLECharacteristicValue({
                                deviceId: that.data.deviceId,
                                serviceId: that.data.serviceId,
                                characteristicId: that.data.characteristicId,
                                value: chunk,
                                success(res) {
                                    console.log(`数据发送成功: ${i + 1}/${totalChunks} (${progress}%)`);
                                    if (i === totalChunks - 1) {
                                        // 发送结束标志
                                        const endBuffer = that.stringToArrayBuffer('END');
                                        wx.writeBLECharacteristicValue({
                                            deviceId: that.data.deviceId,
                                            serviceId: that.data.serviceId,
                                            characteristicId: that.data.characteristicId,
                                            value: endBuffer,
                                            success(res) {
                                                console.log('所有数据发送完成');
                                            }
                                        });
                                    }
                                },
                                fail(res) {
                                    console.error(`数据发送失败: ${i + 1}/${totalChunks}`, res);
                                }
                            });
                        }
                    },
                    fail(err) {
                        console.error('文件读取失败', err);
                    }
                });
            },
            fail(err) {
                console.error('文件选择失败', err);
            }
        });
    },

    // 将字符串转换为 ArrayBuffer
    stringToArrayBuffer(str) {
        const base64 = wx.arrayBufferToBase64(new TextEncoder().encode(str).buffer);
        return wx.base64ToArrayBuffer(base64);
    },

    // 发送控制消息
    sendMessage(message) {
        const that = this;
        const buffer = that.stringToArrayBuffer(message);
        wx.writeBLECharacteristicValue({
            deviceId: that.data.deviceId,
            serviceId: that.data.serviceId,
            characteristicId: that.data.characteristicId,
            value: buffer,
            success(res) {
                console.log(`消息发送成功: ${message}`);
            },
            fail(res) {
                console.error(`消息发送失败: ${message}`, res);
            }
        });
    },
    // 松开按钮时发送消息
    handleTouchEnd() {
      this.sendMessage('释放');
    },
    sendUp() {
        this.sendMessage('上');
    },
    sendDown() {
        this.sendMessage('下');
    },
    sendLeft() {
        this.sendMessage('左');
    },
    sendRight() {
        this.sendMessage('右');
    },
    sendA() {
        this.sendMessage('A');
    },
    sendB() {
        this.sendMessage('B');
    },
    sendC() {
        this.sendMessage('C');
    },
    sendD() {
        this.sendMessage('D');
    }
});
