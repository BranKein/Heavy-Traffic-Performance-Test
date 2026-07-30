package me.yeonhyuk.heavy_traffic.spring_mvc_jpa_parallel_virtual_thread.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.Jws;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.JwtParser;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.MalformedJwtException;
import io.jsonwebtoken.UnsupportedJwtException;
import me.yeonhyuk.heavy_traffic.spring_mvc_jpa_parallel_virtual_thread.common.ResultCodeEnum;
import org.springframework.stereotype.Component;

import java.security.interfaces.RSAPublicKey;
import java.util.UUID;

/**
 * jjwt 라이브러리로 RS256 JWT 를 검증한다 (SR §4).
 * 서명은 properties 로 주입된 RSA(2048) Public Key 로 검증하며,
 * 실패 원인별로 {@link ResultCodeEnum} 을 담은 {@link JwtVerificationException} 을 던진다.
 */
@Component
public class JwtVerifier {

    private static final String EXPECTED_ALGORITHM = "RS256";
    private static final String EXPECTED_ISSUER = "PUSH_BROADCASTING";
    private static final String USER_PK_CLAIM = "userPk";

    private final JwtParser jwtParser;

    public JwtVerifier(RSAPublicKey jwtPublicKey) {
        this.jwtParser = Jwts.parser()
                .verifyWith(jwtPublicKey)
                .build();
    }

    public UUID verify(String token) {
        Jws<Claims> jws = parse(token);

        // RS256 만 허용 (SR §4)
        if (!EXPECTED_ALGORITHM.equals(jws.getHeader().getAlgorithm())) {
            throw new JwtVerificationException(ResultCodeEnum.TOKEN_INVALID_ALGORITHM);
        }

        Claims claims = jws.getPayload();
        if (!EXPECTED_ISSUER.equals(claims.getIssuer())) {
            throw new JwtVerificationException(ResultCodeEnum.TOKEN_INVALID_ISSUER);
        }

        String userPk = claims.get(USER_PK_CLAIM, String.class);
        if (userPk == null || userPk.isBlank()) {
            throw new JwtVerificationException(ResultCodeEnum.TOKEN_MALFORMED);
        }
        try {
            return UUID.fromString(userPk);
        } catch (IllegalArgumentException e) {
            throw new JwtVerificationException(ResultCodeEnum.TOKEN_MALFORMED);
        }
    }

    private Jws<Claims> parse(String token) {
        try {
            return jwtParser.parseSignedClaims(token);
        } catch (ExpiredJwtException e) {
            throw new JwtVerificationException(ResultCodeEnum.TOKEN_EXPIRED);
        } catch (io.jsonwebtoken.security.SecurityException e) {
            // 서명 검증 실패
            throw new JwtVerificationException(ResultCodeEnum.TOKEN_INVALID_SIGNATURE);
        } catch (UnsupportedJwtException | MalformedJwtException | IllegalArgumentException e) {
            throw new JwtVerificationException(ResultCodeEnum.TOKEN_MALFORMED);
        } catch (JwtException e) {
            throw new JwtVerificationException(ResultCodeEnum.TOKEN_MALFORMED);
        }
    }
}
