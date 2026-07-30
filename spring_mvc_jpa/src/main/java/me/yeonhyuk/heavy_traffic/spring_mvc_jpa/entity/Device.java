package me.yeonhyuk.heavy_traffic.spring_mvc_jpa.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.UUID;

@Entity
@Table(name = "device")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
public class Device {

    @Id
    @Column(name = "pk")
    private UUID pk;

    @Column(name = "user_fk")
    private UUID userFk;

    @Column(name = "device_id")
    private UUID deviceId;
}
